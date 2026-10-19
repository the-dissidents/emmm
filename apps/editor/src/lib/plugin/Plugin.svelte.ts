import { Debug } from "$lib/Debug";
import { CommandDefinitions, HookDefinitions, I18nString, PluginManifest, PluginUIValueType, type CommandName, type CommandParam, type CommandReturnData, type HookArgs, type HookName, type HookReturn, type PluginUIItemType } from "./Types";
import { PluginCommandHandlers } from "./Implementation.svelte";

import bootstrapScript from './api.js?raw';
import { Memorized } from "$lib/config/Memorized.svelte";

import * as z from "zod/v4-mini";
import * as fs from '@tauri-apps/plugin-fs';
import * as dialog from "@tauri-apps/plugin-dialog";
import { path } from "@tauri-apps/api";
import { _ } from "svelte-i18n";

export type PluginCommandHandler<C extends CommandName> =
    (param: CommandParam<C>, inst: PluginInstance) =>
        CommandReturnData<C> | Promise<CommandReturnData<C>>;

const HOST_ORIGIN = "*";
const TIMEOUT = 1000;

const PluginRegistryEntry = z.object({
    version: z.string(),
    names: I18nString,
    apiVersion: z.string(),
})
export type PluginRegistryEntry = z.infer<typeof PluginRegistryEntry>;
const registry = Memorized.$dict('plugin-registry', z.string(), PluginRegistryEntry);

export class PluginManager {
    #instances: PluginInstanceImpl[] = $state([]);

    get instances(): readonly PluginInstance[] {
        return this.#instances;
    }

    constructor() { }

    private async handleCommandMessage(inst: PluginInstanceImpl, data: any) {
        if (typeof data.type !== 'string'
         || !(data.type as string).startsWith('plugin:command:')
        ) return;

        const command = (data.type as string).slice('plugin:command:'.length) as CommandName;
        const schema = CommandDefinitions[command];
        const args = schema.shape.param.safeParse(data.args);
        if (args.error) {
            inst.postError(command, 'argument type mismatch', args.error.message);
            return;
        }

        console.log(`receiving command from ${inst.manifest.id}`, command, args);
        try {
            const result = await PluginCommandHandlers[command](args.data as never, inst);
            inst.postResponse(command, result);
        } catch (e) {
            inst.postError(command, 'an error occurred when executing the command', e);
        }
    }

    async loadInstalled(id: string) {
        if (/\.\.|\/|\\/.test(id))
            throw new Error('invalid plugin id');

        const filename = await path.join('plugins', `${id}.js`);
        if (!await fs.exists(filename, { baseDir: fs.BaseDirectory.AppConfig }))
            throw new Error('plugin not found');

        const source = await fs.readTextFile(filename, { baseDir: fs.BaseDirectory.AppConfig });
        const inst = await this.load(source);
        if (!inst) return inst;

        // TODO: ask the user in case of discrepancies
        registry.setItem(inst.manifest.id, {
            version: inst.manifest.version,
            names: inst.manifest.names,
            apiVersion: inst.manifest.apiVersion
        });

        return inst;
    }

    static listInstalled(): ReadonlyMap<string, Readonly<PluginRegistryEntry>> {
        return registry.get();
    }

    static async install(inst: PluginInstance) {
        Debug.assert(inst instanceof PluginInstanceImpl);

        const name = inst.manifest.id + '.js';
        console.log('installing plugin', name);
        if (/\.\.|\/|\\/.test(name))
            throw new Error('invalid plugin id');

        if (
            !(await fs.exists('plugins', { baseDir: fs.BaseDirectory.AppConfig })) ||
            !(await fs.stat('plugins', { baseDir: fs.BaseDirectory.AppConfig })).isDirectory
        ) {
            await fs.mkdir('plugins', { baseDir: fs.BaseDirectory.AppConfig });
        }

        await fs.writeTextFile(await path.join('plugins', name), inst.source,
            { baseDir: fs.BaseDirectory.AppConfig });

        // TODO: ask the user in case of discrepancies
        registry.setItem(inst.manifest.id, {
            version: inst.manifest.version,
            names: inst.manifest.names,
            apiVersion: inst.manifest.apiVersion
        });
    }

    /**
     * Loads a plugin from a Javascript source file.
     *
     * @returns the plugin instance if loaded successfully; `null` if a plugin with the same manifest id has already been loaded
     */
    async load(source: string, install?: boolean): Promise<PluginInstance | null> {
        const inst = await PluginInstanceImpl.load(source);

        if (install) {
            const entry = registry.getItem(inst.manifest.id);
            if (entry) {
                let ok = await dialog.confirm(
                      entry.version < inst.manifest.version ?
                        `确认将已安装的插件「${inst.manifest.id}」更新到新版本？`
                    : entry.version == inst.manifest.version ?
                        `已安装该插件的同一版本，确定需要用这个文件覆盖？`
                    : `已安装该插件的更新版本。确定需要用旧版本覆盖？`);
                if (!ok) try {
                    await inst.unload();
                } catch {
                    return null;
                }
            }
            await PluginManager.install(inst);
        }

        inst.addMessageListener((data) => {
            void this.handleCommandMessage(inst, data);
            return true;
        });
        inst.window.postMessage({ type: 'host:ready' }, HOST_ORIGIN);
        console.log('plugin ready:', inst.manifest);

        const old = this.#instances.find((x) => x.manifest.id == inst.manifest.id);
        this.#instances.push(inst);

        if (old) {
            for (const item of Object.values(inst.manifest.ui)) {
                console.log(item.key, item, old.getConfigType(item.key));
                if ('input' in item && old.getConfigType(item.key) === item.input)
                    inst.setConfig(item.key, old.getConfig(item.key));
            }
            try {
                await this.unload(old);
            } catch {
                return null;
            }
        }

        return inst;
    }

    async unload(inst: PluginInstance) {
        Debug.assert(inst instanceof PluginInstanceImpl);
        const i = this.#instances.indexOf(inst);
        Debug.assert(i >= 0);
        this.#instances.splice(i, 1);
        await inst.unload();
    }

    async unloadAll() {
        for (const inst of this.#instances) {
            try {
                await inst.unload();
            } catch (e) {
                console.warn('error unloading plugin', inst, e);
            }
        }
        this.#instances = [];
    }

    async dispatchHook<H extends HookName>(
        name: H,
        receive: (
            prevResponse?: HookReturn<H>,
            inst?: PluginInstance
        ) => HookArgs<H> | Promise<HookArgs<H>>
    ) {
        let args = await receive();
        for (const inst of this.#instances) {
            const result = await inst.dispatch(name, args);
            if (result) args = await receive(result, inst);
        }
    }
}

function addScript(
    doc: Document,
    source: string,
) {
    const script = doc.createElement('script');
    script.textContent = source;
    doc.head.appendChild(script);
}

type ConfigItem = {
    type: PluginUIItemType,
    value: unknown,
};

export interface PluginInstance {
    readonly window: Window;
    readonly frame: HTMLIFrameElement;
    readonly manifest: PluginManifest;

    getConfigType(key: string): PluginUIItemType;
    getConfig(key: string): unknown;
    setConfig(key: string, value: unknown): boolean;

    callAction(key: string): Promise<void>;
}

class PluginInstanceImpl implements PluginInstance {
    #config: Record<string, ConfigItem> = $state({});
    #listeners = new Set<(ev: MessageEvent) => void>();

    readonly window: Window;

    private constructor(
        readonly source: string,
        readonly frame: HTMLIFrameElement,
        readonly manifest: PluginManifest,
    ) {
        Debug.assert(!!frame.contentWindow);
        this.window = frame.contentWindow;

        for (const item of manifest.ui) {
            if ('input' in item) {
                this.#config[item.key] = {
                    type: item.input,
                    value: item.defaultValue
                };
            }
        }
    }

    getConfigType(key: string) {
        return this.#config[key]?.type ?? null;
    }

    getConfig(key: string) {
        Debug.assert(key in this.#config);
        return this.#config[key].value;
    }

    setConfig(key: string, value: unknown): boolean {
        Debug.assert(key in this.#config);
        const schema = PluginUIValueType[this.#config[key].type];
        if (schema.safeParse(value).success) {
            this.#config[key].value = value;
            return true;
        }
        return false;
    }

    async callAction(key: string) {
        await this.dispatch('action', { args: key });
    }

    addMessageListener(callback: (data: any) => boolean) {
        const listener = (ev: MessageEvent) => {
            const data = ev.data;
            if (typeof data !== 'object' || data.id !== this.manifest.id) return;
            if (!callback(data)) {
                this.window.removeEventListener('message', listener);
                this.#listeners.delete(listener);
            }
        };
        window.addEventListener('message', listener);
        this.#listeners.add(listener);
    }

    async unload() {
        try {
            await this.dispatch('finalize', { args: undefined });
        } finally {
            for (const listener of this.#listeners)
                window.removeEventListener('message', listener);
            this.frame.remove();
        }
    }

    static async load(source: string) {
        const frame = document.createElement('iframe');
        frame.style.visibility = 'hidden';
        frame.width = '0px';
        frame.height = '0px';
        frame.sandbox = 'allow-scripts allow-same-origin';
        document.body.append(frame);

        const manifest: PluginManifest = await new Promise((resolve, reject) => {
            setTimeout(() => reject('handshake timed out'), TIMEOUT);

            window.addEventListener('message', (ev) => {
                const data = ev.data;
                const result = PluginManifest.safeParse(data);
                if (typeof data !== 'object' || data.type !== 'plugin:ready' || result.error) {
                    reject(`handshake failed, received ${data}`);
                    return;
                }
                resolve(result.data);
            }, { once: true });

            const doc = document.implementation.createHTMLDocument();
            addScript(doc, bootstrapScript + source);
            // addScript(doc, bootstrapScript);
            // addScript(doc, source);
            console.log(doc);
            frame.srcdoc = doc.documentElement.outerHTML;
        });
        return new PluginInstanceImpl(source, frame, manifest);
    }

    postError(cmd: CommandName | null, message: string, payload?: unknown) {
        if (cmd) this.window.postMessage(
            { type: `host:command:${cmd}`, status: 'error', message, payload }, HOST_ORIGIN);
        else this.window.postMessage(
            { type: 'host:error', message, payload }, HOST_ORIGIN);
        console.log(`posted error to ${this.manifest.id}`, cmd, message, payload);
    }

    postResponse<C extends CommandName>(
        name: C, result: CommandReturnData<C>
    ) {
        this.window.postMessage(
            { type: `host:command:${name}`, status: 'ok', result: result.data },
            HOST_ORIGIN, result.transfer
        );
        console.log(`posted response to ${this.manifest.id}`, name, result);
    }

    async dispatch<H extends HookName>(
        name: H, args: HookArgs<H>
    ): Promise<undefined | HookReturn<H>> {
        console.log(`posted hook notification to ${this.manifest.id}`, name, args);

        const msg = await new Promise<any>((resolve, reject) => {
            setTimeout(() => reject('hook timed out'), TIMEOUT);

            this.addMessageListener((data) => {
                if (data.id !== this.manifest.id
                    || data.type !== `plugin:hook:${name}`) return true;
                resolve(data);
                return false;
            });
            this.window.postMessage(
                { type: `host:hook:${name}`, args: args.args },
                HOST_ORIGIN, args.transfer
            );
        });
        console.log(`got hook result from ${this.manifest.id}`, name, msg);
        if (!msg.result) return undefined;

        const result = HookDefinitions[name].shape.return.safeParse(msg.result);
        if (result.error) {
            this.postError(null, 'invalid hook result');
            return undefined;
        }
        return result.data;
    }
}
