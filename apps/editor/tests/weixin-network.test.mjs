import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve('vite'))('esbuild');
const testState = globalThis.__weixinNetworkTest = {
    fetches: [], invocations: [], initCallbacks: [], saved: 0, files: {},
    response: () => new Response(JSON.stringify({ access_token: 'test-token', expires_in: 7200 })),
    invoke: async () => {},
};
const mockModules = {
    '@tauri-apps/plugin-http': `export async function fetch(input, init) {
        const state = globalThis.__weixinNetworkTest;
        state.fetches.push({ input: String(input), init });
        return state.response(input, init);
    }`,
    '@tauri-apps/api/core': `export class Channel {} export async function invoke(command, args) {
        const state = globalThis.__weixinNetworkTest;
        state.invocations.push({ command, args });
        return state.invoke(command, args);
    }`,
    '@tauri-apps/api/path': `export const appLocalDataDir = async () => '/tmp';
        export const appConfigDir = async () => '/tmp/test-config';
        export const join = (...parts) => parts.join('/');`,
    '@tauri-apps/plugin-fs': `export const BaseDirectory = {}; export async function writeFile() {}
        export async function mkdir() {}
        export async function exists(name) { return name in globalThis.__weixinNetworkTest.files; }
        export async function readTextFile(name) { return globalThis.__weixinNetworkTest.files[name]; }
        export async function writeTextFile(name, data) { globalThis.__weixinNetworkTest.files[name] = data; }
        export async function readFile() { throw new Error('Unexpected file read'); }`,
    'svelte-i18n': `import { writable } from 'svelte/store'; export const _ = writable(key => key);`,
    '$lib/config/Memorized.svelte': `import { writable } from 'svelte/store';
        function store(value) {
            const original = writable(value);
            return { ...original, get: () => value, set: next => { value = next; original.set(next); },
                getItem: key => value.get(key), setItem: (key, next) => value.set(key, next) };
        }
        export const Memorized = {
            $: (key, schema, initial) => store(initial),
            $dict: () => store(new Map()),
            onInitialize: callback => globalThis.__weixinNetworkTest.initCallbacks.push(callback),
            save: async () => { globalThis.__weixinNetworkTest.saved++; },
        };`,
};
const temporary = await mkdtemp(join(tmpdir(), 'emmm-network-test-'));
try {
    const output = join(temporary, 'network.mjs');
    await build({
        stdin: { contents: `export { plugins } from './src/lib/plugins/Settings.ts';
            export * from './src/lib/integration/weixin/Network.ts';
            export { WeixinClient } from './src/lib/integration/weixin/API.svelte.ts';
            export * from './src/lib/integration/weixin/Servers.ts';`,
            resolveDir: resolve('.'), loader: 'ts' },
        bundle: true, platform: 'node', format: 'esm', outfile: output,
        alias: { $lib: resolve('src/lib') },
        plugins: [{ name: 'test-boundaries', setup(builder) {
            builder.onResolve({ filter: /.*/ }, args => args.path in mockModules
                ? { path: args.path, namespace: 'mock' } : undefined);
            builder.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({
                contents: mockModules[args.path], loader: 'js', resolveDir: resolve('.'),
            }));
        }}],
    });
    const { plugins, weixinNetwork, weixinFetch, getWeixinPublicIP, WeixinClient, weixinServers, saveWeixinServers } = await import(pathToFileURL(output));
    const server = { id: 'main', name: 'Main', host: '47.100.96.250', username: 'root', sshPort: 22, identityFile: '/tmp/test-key', hostKeys: ['47.100.96.250 ssh-ed25519 test'] };
    weixinServers.set([server]);
    const configure = (mode, sshServer = 'main', localPort = 18781) =>
        { plugins.set({...plugins.get(),forwarding:mode === 'ssh'}); weixinNetwork.set({ mode, sshServer, localPort }); }
    const reset = () => { testState.fetches = []; testState.invocations = []; };

    configure('direct');
    const client = new WeixinClient('test');
    client.appid = 'test-app-id'; client.secret = 'test-secret';
    await client.fetchToken();
    assert.equal(testState.invocations.length, 0);
    assert.equal(testState.fetches[0].init.proxy, undefined);
    assert.match(testState.fetches[0].input, /stable_token/);

    configure('ssh'); reset();
    await client.fetchToken(true);
    testState.response = () => new Response(JSON.stringify({ url: 'https://example.com/test.jpg' }));
    await client.uploadSmallImage(new Blob(['image']), 'test.jpg', 'test-image', true);
    assert.equal(testState.fetches.length, 2);
    for (const request of testState.fetches)
        assert.equal(request.init.proxy.all, 'socks5h://127.0.0.1:18781');
    assert.match(testState.fetches[1].input, /media\/uploadimg/);
    assert.ok(testState.fetches[1].init.body instanceof FormData);
    assert.equal(testState.fetches[1].init.body.get('media').name, 'test.jpg');
    assert.equal(testState.invocations[0].command, 'ensure_weixin_tunnel');
    assert.deepEqual(testState.invocations[0].args, { server, port: 18781 });

    reset(); testState.invoke = async () => { throw new Error('SSH failed'); };
    await assert.rejects(() => weixinFetch('https://api.weixin.qq.com/'), /SSH failed/);
    assert.equal(testState.fetches.length, 0, 'Never fall back to direct connection');
    testState.invoke = async () => {};
    configure('ssh', ''); reset();
    await assert.rejects(() => weixinFetch('https://api.weixin.qq.com/'), /missing-server/);
    assert.equal(testState.fetches.length + testState.invocations.length, 0);
    configure('ssh', 'main', 80);
    await assert.rejects(() => weixinFetch('https://api.weixin.qq.com/'), /invalid-port/);

    configure('ssh'); reset();
    testState.response = input => String(input).includes('3322')
        ? new Response('', { status: 503 }) : new Response(JSON.stringify({ ip: '47.100.96.250' }));
    assert.equal(await getWeixinPublicIP(), '47.100.96.250');
    assert.equal(testState.invocations.length, 1, 'IP providers share one route snapshot');
    assert.equal(testState.fetches.length, 2);
    for (const request of testState.fetches)
        assert.equal(request.init.proxy.all, 'socks5h://127.0.0.1:18781');

    configure('direct'); reset();
    testState.response = () => new Response('127.0.0.1');
    await weixinFetch('https://api.weixin.qq.com/');
    assert.equal(testState.fetches[0].init.proxy, undefined, 'Switching back restores direct requests');
    await saveWeixinServers([server]);
    assert.deepEqual(JSON.parse(testState.files['weixin-servers.json']), [server]);
    weixinServers.set([]);
    await Promise.all(testState.initCallbacks.map(callback => callback()));
    let restored;
    const unsubscribe = weixinServers.subscribe(value => restored = value);
    assert.deepEqual(restored, [server], 'Server profiles restore independently of OS SSH configuration');
    unsubscribe();
    weixinServers.set([{...server, hostKeys: []}]);
    configure('ssh'); reset();
    await assert.rejects(() => weixinFetch('https://api.weixin.qq.com/'), /not trusted/);
    assert.equal(testState.invocations.length + testState.fetches.length, 0, 'Never authenticate to an untrusted server');
    weixinServers.set([server]);
    configure('ssh');
    await new Promise(resolve => setTimeout(resolve, 600));
    assert.equal(testState.saved, 2, 'Connection and account settings save after editing');
    console.log('Passed: direct route, token and multipart proxy route, failure without fallback, validation, IP route, switching, automatic save.');
} finally {
    delete globalThis.__weixinNetworkTest;
    await rm(temporary, { recursive: true, force: true });
}
