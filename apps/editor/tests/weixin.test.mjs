import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Window } from '../../../packages/libemmm/node_modules/happy-dom/lib/index.js';
import * as emmm from '../../../packages/libemmm/dist/index.js';
import { inlineCss } from '@the_dissidents/dom-css-inliner';

const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve('vite'))('esbuild');
const window = new Window();
if (!window.CSSStyleDeclaration.prototype[Symbol.iterator])
    window.CSSStyleDeclaration.prototype[Symbol.iterator] = function* () {
        for (let i = 0; i < this.length; i++) yield this.item(i);
    };
globalThis.window = window;
for (const key of [
    'document',
    'DOMParser',
    'Node',
    'NodeFilter',
    'HTMLAnchorElement',
    'HTMLImageElement',
])
    globalThis[key] = window[key];
const state = (globalThis.__weixinTest = {
    stores: new Map(),
    commands: [],
    callbacks: [],
    requests: [],
    saves: 0,
    fetch: async () => new Response('{}'),
});
const mocks = {
    sass: `export class SassColor {}`,
    '@tauri-apps/plugin-http': `export const fetch = async (url, init) => {
        const s = globalThis.__weixinTest; s.requests.push({url: String(url), init});
        return s.fetch(url, init);
    };`,
    '@tauri-apps/api/core': `export class Channel {} export const invoke = async (command, args) => {
        const s = globalThis.__weixinTest; s.commands.push({command, args});
        return s.invoke?.(command, args);
    };`,
    '@tauri-apps/api/path': `export const join = (...x) => x.join('/'); export const appLocalDataDir=async()=>'/tmp';`,
    '@tauri-apps/plugin-fs': `export const BaseDirectory={}; export const exists=async()=>false; export const mkdir=async()=>{}; export const readFile=async()=>new Uint8Array(); export const writeFile=async()=>{};`,
    'svelte-i18n': `import {writable} from 'svelte/store'; export const _ = writable(key => key);`,
    '$lib/config/Memorized.svelte': `import {writable} from 'svelte/store';
        function store(key, value) {
            const all = globalThis.__weixinTest.stores;
            if (all.has(key)) return all.get(key);
            const w = writable(value);
            const s = {...w, get: () => value, set: x => {value = x; w.set(x);},
                getItem: k => value.get(k), setItem: (k, x) => {value.set(k, x); w.set(value);},
                deleteItem: k => {const result = value.delete(k); w.set(value); return result;}};
            all.set(key, s); return s;
        }
        export const Memorized = {$: (k,t,v) => store(k,v), $dict: k => store(k,new Map()),
            onInitialize: cb => globalThis.__weixinTest.callbacks.push(cb),
            save: async () => {globalThis.__weixinTest.saves++;}};`,
    '$lib/RustAPI': `export const RustAPI = {
        hashFile: async u => 'hash:' + u.href,
        compressImage: async () => ({blob: new Blob(['test image']), ext: 'png'}),
        getWeixinToken: async (...args) => {globalThis.__weixinTest.commands.push({command:'get-token', args});
            return globalThis.__weixinTest.getToken?.() ?? {access_token:'test-token', expires_in:7200};},
    };`,
    './Images': `export const imageDimensions = async () => ({width:3350,height:1000});
        export const resolveImageURL = async value => value;`,
};
const dir = await mkdtemp(join(tmpdir(), 'emmm-weixin-'));
try {
    const history = process.env.EMMM_EDITION !== 'formal';
    const modules = [
        'Fields',
        'Drafts',
        'Digest',
        'Connection',
        ...(history ? ['History', 'Preview', 'FooterStyle'] : []),
    ];
    const entry =
        modules
            .map(
                (name) =>
                    `export * from './src/lib/integration/weixin/${name}.ts';`
            )
            .join('\n') +
        `export * from './src/lib/integration/weixin/API.svelte.ts';
         export {initHeader,basicFieldSystems} from './src/lib/emmm/Header.tsx';
         export {CustomHTMLRenderer,CustomConfig} from './src/lib/emmm/Custom.tsx';
         export * as Emmm from '@the_dissidents/libemmm';
         import 'colorjs.io';
         export * as Color from 'colorjs.io/fn';
         export * as z from 'zod/v4-mini';
         export {ZArticleColors} from './src/lib/ColorTheme.ts';`;
    await build({
        stdin: { contents: entry, resolveDir: resolve('.'), loader: 'ts' },
        bundle: true,
        platform: 'node',
        format: 'esm',
        outfile: join(dir, 'test.mjs'),
        alias: { $lib: resolve('src/lib') },
        loader: { '.html': 'text' },
        plugins: [
            {
                name: 'boundaries',
                setup(b) {
                    b.onResolve({ filter: /\.html\?raw$/ }, (args) => ({
                        path: resolve(args.resolveDir, args.path.slice(0, -4)),
                        namespace: 'template',
                    }));
                    b.onLoad(
                        { filter: /.*/, namespace: 'template' },
                        async (args) => ({
                            contents: await readFile(args.path, 'utf8'),
                            loader: 'text',
                        })
                    );
                    b.onResolve({ filter: /.*/ }, (args) =>
                        args.path in mocks
                            ? { path: args.path, namespace: 'mock' }
                            : undefined
                    );
                    b.onLoad({ filter: /.*/, namespace: 'mock' }, (args) => ({
                        contents: mocks[args.path],
                        loader: 'js',
                        resolveDir: resolve('.'),
                    }));
                },
            },
        ],
    });
    const api = await import(pathToFileURL(join(dir, 'test.mjs')));
    const {
        field,
        setField,
        defaultCrops,
        articleMetadata,
        WeixinClient,
        WeixinAPIError,
        saveArticleDraft,
        uploadDraftImages,
        proxies,
        connection,
        proxyRequest,
    } = api;
    const colors = Object.fromEntries(
        ['theme', 'text', 'commentary', 'link', 'highlight'].map((key) => [
            key,
            api.Color.getColor('#123456'),
        ])
    );
    assert.throws(() => JSON.stringify(colors), /circular/);
    const serializedColors = JSON.stringify(
        api.z.encode(api.ZArticleColors, colors)
    );
    assert.ok(serializedColors.includes('theme'));
    colors.text = api.Color.getColor('#654321');
    assert.notEqual(
        JSON.stringify(api.z.encode(api.ZArticleColors, colors)),
        serializedColors
    );
    let source = '正文第一段。\r\n\r\n正文第二段。';
    const author = 'A [B] | $x \\';
    source = setField(source, 'wx-author', author);
    assert.equal(field(source, 'wx-author'), author);
    assert.ok(source.endsWith('正文第二段。'));
    assert.ok(source.startsWith('[-var wx-author='));
    const parsed = new emmm.ParseContext(
        emmm.Configuration.from(emmm.DefaultConfiguration, false)
    ).parse(new emmm.SimpleScanner(source));
    assert.equal(parsed.context.variables.get('wx-author'), author);
    assert.equal(parsed.messages.length, 0);
    assert.equal(
        (setField(source, 'wx-author', 'changed').match(/wx-author=/g) || [])
            .length,
        1
    );
    assert.equal(
        setField(source, 'wx-author', ''),
        '正文第一段。\r\n\r\n正文第二段。'
    );
    const headerConfig = emmm.Configuration.from(
        emmm.DefaultConfiguration,
        false
    );
    headerConfig.initializers.push(api.initHeader);
    headerConfig.systemModifiers.add(...api.basicFieldSystems);
    headerConfig.kernel.collapseWhitespaces = true;
    const headerParsed = new emmm.ParseContext(headerConfig).parse(
        new emmm.SimpleScanner(
            '[-title] 原有标题\n\n[-author] 作者\n\n[-cover-img] file:/tmp/cover.png\n\n[-poster-img] file:/tmp/poster.png\n\n[-digest] 原有摘要\n第二行。\n\n正文。'
        )
    );
    const renderedParsed = new api.Emmm.ParseContext(
        api.Emmm.Configuration.from(api.CustomConfig, false)
    ).parse(new api.Emmm.SimpleScanner('[-title] 无附加字段\n\n正文。'));
    const rendered = await api.CustomHTMLRenderer.render(
        renderedParsed,
        new api.Emmm.HTMLRenderState()
    );
    assert.ok(
        ![...rendered.querySelector('header').childNodes].some(
            (node) =>
                node.nodeType === Node.TEXT_NODE &&
                node.textContent.trim() === 'false'
        ),
        'An absent metadata block must not render a boolean'
    );
    const info = await api.getArticleInfo(headerParsed);
    assert.equal(info.title, '原有标题');
    assert.equal(info.author, '作者');
    assert.equal(
        articleMetadata('', document, info).cover,
        '',
        'A Weixin cover requires explicit selection, regardless of site cover or poster metadata'
    );
    assert.equal(
        articleMetadata(
            setField('', 'wx-cover', 'file:/tmp/manual.png'),
            document,
            info
        ).cover,
        'file:/tmp/manual.png'
    );
    assert.equal(info.digest, '原有摘要第二行。');
    const crops = defaultCrops(3350, 1000);
    assert.deepEqual(crops.wide, [0, 0, 2.35 / 3.35, 1]);
    assert.deepEqual(crops.square, [1 - 1 / 3.35, 0, 1, 1]);

    const client = new WeixinClient('test');
    client.appid = 'test-account';
    await client.setSecret('test-secret');
    assert.equal(
        state.stores.get('weixinAccounts').getItem('test').secret,
        'test-secret',
        'AppSecret uses ordinary account settings'
    );
    assert.equal(client.secret, 'test-secret');
    await client.setSecret('');
    await assert.rejects(() => client.fetchToken(), /No credentials/);
    await client.setSecret('test-secret');
    await Promise.all([client.fetchToken(), client.fetchToken()]);
    assert.equal(
        state.commands.filter((x) => x.command === 'get-token').length,
        1,
        'Coalesce token requests'
    );
    assert.equal(
        state.requests.length,
        0,
        'AppSecret and stable token exchange never pass through frontend HTTP'
    );
    let completeToken;
    state.getToken = () => new Promise((resolve) => (completeToken = resolve));
    const tokenRequest = client.fetchToken(true);
    client.appid = 'changed-account';
    completeToken({ access_token: 'stale-token', expires_in: 7200 });
    await assert.rejects(tokenRequest, /Account changed/);
    assert.equal(
        client.tokenOk,
        false,
        'Late token responses do not attach to another account'
    );
    client.appid = 'test-account';
    delete state.getToken;

    const doc = document.implementation.createHTMLDocument();
    doc.body.innerHTML = '<p>正文。</p>';
    let remote,
        creates = 0,
        updates = 0;
    const fake = {
        appid: 'test-account',
        ensureAccount: async () => {},
        uploadCover: async () => 'cover-id',
        getDraft: async () => {
            if (!remote) throw new WeixinAPIError({ errcode: 46001 });
            return [structuredClone(remote)];
        },
        createDraft: async (article) => {
            creates++;
            remote = structuredClone(article);
            return 'draft-id';
        },
        updateDraft: async (id, index, article) => {
            updates++;
            remote = structuredClone(article);
        },
        getDrafts: async () => ({
            total: 1,
            drafts: [
                {
                    id: 'draft-id',
                    updateTime: new Date(),
                    articles: [structuredClone(remote)],
                },
            ],
        }),
    };
    const title =
        '尘埃中的心 · 翻译｜阴性单数的历史：电影手册论《德国，苍白的母亲》';
    const draftSource = setField(
        setField('', 'wx-title', title),
        'wx-cover',
        'file:/tmp/cover.png'
    );
    const options = {
        client: fake,
        source: draftSource,
        doc,
        key: 'temporary',
        temporaryKey: 'temporary',
        content: '<p>正文。</p>',
        notCached: 0,
        digest: '摘要',
        validate: () => {},
    };
    assert.equal((await saveArticleDraft(options)).id, 'draft-id');
    assert.equal(remote.title, title);
    assert.equal(
        (await saveArticleDraft({ ...options, key: '/saved/article.emmm' }))
            .unchanged,
        true
    );
    assert.ok(
        state.stores
            .get('weixin-drafts')
            .getItem('test-account:/saved/article.emmm'),
        'Saving a temporary document moves its draft link'
    );
    assert.equal(
        state.stores.get('weixin-drafts').getItem('test-account:temporary'),
        undefined
    );
    assert.equal(creates, 1);
    await saveArticleDraft({
        ...options,
        key: '/saved/article.emmm',
        content: '<p>修改后的正文。</p>',
    });
    assert.equal(updates, 1);
    remote.content = '<p>微信后台修改。</p>';
    await assert.rejects(
        () => saveArticleDraft({ ...options, key: '/saved/article.emmm' }),
        /conflict/
    );
    assert.equal(updates, 1, 'Remote edits require an explicit resolution');
    await saveArticleDraft({
        ...options,
        key: '/saved/article.emmm',
        resolution: 'overwrite',
    });
    assert.equal(updates, 2);
    remote = undefined;
    await assert.rejects(
        () => saveArticleDraft({ ...options, key: '/saved/article.emmm' }),
        /missing/
    );
    assert.equal(
        creates,
        1,
        'Remote deletion does not silently create another draft'
    );
    const originalCreate = fake.createDraft;
    fake.createDraft = async (article) => {
        await originalCreate(article);
        throw new Error('Response lost');
    };
    await assert.rejects(
        () =>
            saveArticleDraft({
                ...options,
                key: 'lost-response',
                temporaryKey: 'lost-response',
            }),
        /uncertain/
    );
    fake.createDraft = originalCreate;
    await saveArticleDraft({
        ...options,
        key: 'lost-response',
        temporaryKey: 'lost-response',
    });
    assert.equal(
        creates,
        2,
        'A lost create response is recovered without another create request'
    );
    await assert.rejects(
        () =>
            saveArticleDraft({
                ...options,
                key: 'changed',
                validate: () => {
                    throw new Error('changed');
                },
            }),
        /changed/
    );
    assert.equal(creates, 2);
    assert.equal(
        state.stores.get('weixin-drafts').getItem('test-account:changed'),
        undefined
    );
    await assert.rejects(
        () => saveArticleDraft({ ...options, notCached: 1 }),
        /not-ready/
    );
    fake.uploadSmallImage = async () => {
        throw new Error('Image upload failed');
    };
    doc.body.innerHTML = '<img src="file:/tmp/image.png">';
    await assert.rejects(
        () => uploadDraftImages(fake, doc, ''),
        /Image upload failed/
    );

    if (history) {
        const {
            renderHistory,
            extractLinkedHistory,
            prepareHistory,
            historyState,
            extendWeixinPreview,
            finalizeWeixinFooterColors,
            syncWeixinFooterHeadingColors,
        } = api;
        const cards = [1, 2, 3].map((i) => ({
            title: `第${i}期`,
            url: `https://mp.weixin.qq.com/s/${i}`,
            image: `https://mmbiz.qpic.cn/${i}`,
        }));
        const footer = renderHistory({ cards });
        const linked = `<meta property="og:title" content="最新一期"><meta property="og:image" content="https://mmbiz.qpic.cn/latest"><section id="js_content">${footer.outerHTML}</section>`;
        assert.deepEqual(
            extractLinkedHistory(
                linked,
                'https://mp.weixin.qq.com/s/latest'
            ).cards.map((x) => x.title),
            ['最新一期', '第1期', '第2期']
        );
        let attempts = 0;
        state.fetch = async () => {
            attempts++;
            if (attempts < 3) throw Error('temporary network error');
            return new Response(linked);
        };
        await prepareHistory('https://mp.weixin.qq.com/s/retry');
        assert.equal(attempts, 3, 'History retries transient failures twice');
        assert.equal(historyState.get?.(), undefined);
        let status;
        const unsubscribe = historyState.subscribe((x) => (status = x));
        assert.equal(status.status, 'ready');
        await assert.rejects(
            () => prepareHistory('file:/tmp/footer.html'),
            /invalid-link/
        );
        assert.equal(status.status, 'error');
        unsubscribe();
        doc.body.innerHTML =
            '<section class="article-body"><header><h1><span class="title" style="color:#cc3311">标题</span></h1></header><p>正文</p></section>';
        await extendWeixinPreview(
            doc,
            setField(
                setField('', 'wx-history', 'https://mp.weixin.qq.com/s/retry'),
                'wx-history-enabled',
                'false'
            )
        );
        assert.ok(
            doc.querySelector('[data-weixin-history]'),
            'A link alone activates history; obsolete flags are ignored'
        );
        syncWeixinFooterHeadingColors(doc, window);
        const color = window.getComputedStyle(
            doc.querySelector('.title')
        ).color;
        const style = doc.createElement('style');
        style.textContent =
            'p {margin-block:0 1.5em;padding-block:0 .5em} strong {color:#28428c}';
        doc.head.append(style);
        inlineCss(doc, { removeStyleTags: true, removeClasses: true });
        finalizeWeixinFooterColors(doc);
        assert.equal(
            doc.querySelector('[data-weixin-history] strong').style.color,
            color
        );
        for (const p of doc.querySelectorAll('[data-weixin-history] p')) {
            assert.equal(p.style.getPropertyValue('margin-block'), '0');
            assert.equal(p.style.getPropertyValue('padding-block'), '0');
        }
        assert.equal(
            doc.querySelector('[data-weixin-history] [data-weixin-footer-gap]')
                ?.style.height,
            '72px'
        );
        await writeFile(
            join(dir, 'footer.html'),
            doc.documentElement.outerHTML
        );
        doc.body.innerHTML = '<p>正文。</p>';
        await extendWeixinPreview(doc, setField('', 'wx-history', 'api:3'));
        assert.ok(
            doc.querySelector('[data-weixin-history-error]'),
            'Obsolete sources visibly fail rather than disappearing'
        );
    }
    state.invoke = async (command, args) => {
        assert.equal(command, 'validate_weixin_proxy');
        return args.settings;
    };
    await api.saveProxy({
        profileId: 'temporary',
        name: 'Temporary proxy',
        serviceUrl: 'https://example.test',
        username: 'emmm',
        password: 'saved-password',
        certificate: '',
    });
    assert.equal(proxies.get()[0].password, 'saved-password');
    const saves = state.saves;
    connection.set({ mode: 'relay', profileId: 'temporary' });
    await api.deleteProxy('temporary');
    assert.equal(proxies.get().length, 0);
    assert.equal(connection.get().profileId, '');
    assert.ok(state.saves > saves);
    proxies.set([
        {
            id: 'server',
            name: 'Server',
            endpoint: 'https://example.test',
            username: 'emmm',
            password: 'proxy-password',
            certificate: '',
            revision: '1',
        },
    ]);
    connection.set({ mode: 'relay', profileId: 'server' });
    const before = state.requests.length;
    await client.ensureAccount();
    assert.deepEqual(
        state.commands.filter((x) => x.command === 'get-token').at(-1).args[2],
        {
            endpoint: 'https://example.test',
            username: 'emmm',
            password: 'proxy-password',
            certificate: '',
        },
        'The token exchange uses the selected proxy'
    );
    state.invoke = async (command, args) => {
        assert.equal(args.settings.password, 'proxy-password');
        assert.equal(args.settings.endpoint, 'https://example.test');
        assert.equal(args.token, 'test-token');
        if (command === 'proxy_weixin_request')
            return { total_count: 0, item: [] };
        if (command === 'proxy_weixin_upload')
            return { media_id: 'cover', url: 'https://mmbiz.qpic.cn/body.png' };
        throw new Error('Unexpected command');
    };
    await client.getDrafts(0);
    await client.uploadCover(new Blob(['image']), 'cover.png');
    await client.uploadSmallImage(
        new Blob(['image']),
        'body.png',
        'proxy-body'
    );
    assert.equal(
        state.requests.length,
        before,
        'Token, JSON and both uploads stay on the proxy route'
    );
    state.invoke = async () => {
        throw new Error('proxy-auth-required');
    };
    await assert.rejects(
        () => proxyRequest('draft/add', 'test-token', {}),
        /proxy-auth-required/
    );
    assert.equal(
        state.requests.length,
        before,
        'Proxy failures never fall back to direct HTTP'
    );
    connection.set({ mode: 'relay', profileId: 'missing' });
    await assert.rejects(() => client.fetchToken(), /proxy-required/);
    assert.equal(
        state.requests.length,
        before,
        'An obsolete or missing profile never silently bypasses the proxy'
    );
    connection.set({ mode: 'relay', profileId: 'server' });
    let finishProxyToken;
    state.getToken = () =>
        new Promise((resolve) => {
            finishProxyToken = resolve;
        });
    const pendingProxyToken = client.fetchToken(true);
    connection.set({ mode: 'direct', profileId: '' });
    finishProxyToken({ access_token: 'wrong-route', expires_in: 7200 });
    await assert.rejects(pendingProxyToken, /Account changed/);
    assert.equal(
        client.tokenOk,
        false,
        'Late token responses cannot attach to another route'
    );
    delete state.getToken;
    console.log(
        'Passed: metadata/parser compatibility, local password settings, token invalidation, default crops, draft add/update/deduplication, conflict/deletion, uncertain response recovery, source changes, image failures and standard proxy routing' +
            (history
                ? ', linked history retries/failures/spacing/colors.'
                : '.')
    );
} finally {
    delete globalThis.__weixinTest;
    await rm(dir, { recursive: true, force: true });
    await window.happyDOM.close();
}
