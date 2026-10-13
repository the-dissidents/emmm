import { Debug } from "$lib/Debug";
import { CommandDefinitions, HookDefinitions, PluginManifest, type CommandName, type CommandParam, type CommandReturn, type HookName, type HookParam, type HookReturn } from "./Commands";

import bootstrapScript from './host/api.js?raw';

export interface PluginInstance {
    readonly window: Window;
    readonly frame: HTMLIFrameElement;
    readonly manifest: PluginManifest;
}

export type PluginCommandHandler<C extends CommandName> =
    (param: CommandParam<C>, inst: PluginInstance) => CommandReturn<C> | Promise<CommandReturn<C>>;

const HOST_ORIGIN = "*";
const TIMEOUT = 1000;

export class PluginManager {
    #instances: PluginInstanceImpl[] = [];

    get instances(): readonly PluginInstance[] {
        return this.#instances;
    }

    constructor(
        readonly commandHandlers: { readonly [C in CommandName]: PluginCommandHandler<C> }
    ) { }

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
            const result = await this.commandHandlers[command](args.data as never, inst);
            inst.postResponse(command, result);
        } catch (e) {
            inst.postError(command, 'an error occurred when executing the command', e);
        }
    }

    /**
     * Loads a plugin from a Javascript source file.
     * @returns the plugin instance if loaded successfully; `null` if a plugin with the same manifest id has already been loaded
     */
    async load(source: string) {
        const inst = await PluginInstanceImpl.load(source);

        if (this.#instances.find((x) => x.manifest.id == inst.manifest.id)) {
            try {
                await inst.unload();
            } finally {
                return null;
            }
        }

        this.#instances.push(inst);
        inst.addMessageListener((data) => {
            void this.handleCommandMessage(inst, data);
            return true;
        });
        inst.window.postMessage({ type: 'host:ready' }, HOST_ORIGIN);
        console.log('plugin ready', inst.manifest);
        return inst;
    }

    async dispatchHook<H extends HookName>(
        name: H,
        receive: (
            prevResponse?: HookReturn<H>,
            inst?: PluginInstance
        ) => HookParam<H> | Promise<HookParam<H>>
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

class PluginInstanceImpl {
    private listeners = new Set<(ev: MessageEvent) => void>();
    readonly window: Window;

    private constructor(
        readonly frame: HTMLIFrameElement,
        readonly manifest: PluginManifest,
    ) {
        Debug.assert(!!frame.contentWindow);
        this.window = frame.contentWindow;
    }

    addMessageListener(callback: (data: any) => boolean) {
        const listener = (ev: MessageEvent) => {
            const data = ev.data;
            if (typeof data !== 'object' || data.id !== this.manifest.id) return;
            if (!callback(data)) {
                this.window.removeEventListener('message', listener);
                this.listeners.delete(listener);
            }
        };
        window.addEventListener('message', listener);
        this.listeners.add(listener);
    }

    async unload() {
        await this.dispatch('finalize', undefined);
        for (const listener of this.listeners)
            window.removeEventListener('message', listener);
        this.frame.remove();
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
        return new PluginInstanceImpl(frame, manifest);
    }

    postError(cmd: CommandName | null, message: string, payload?: unknown) {
        if (cmd) this.window.postMessage(
            { type: `host:command:${cmd}`, status: 'error', message, payload }, HOST_ORIGIN);
        else this.window.postMessage(
            { type: 'host:error', message, payload }, HOST_ORIGIN);
        console.log(`posted error to ${this.manifest.id}`, cmd, message, payload);
    }

    postResponse<C extends CommandName>(name: C, result: CommandReturn<C>) {
        this.window.postMessage({ type: `host:command:${name}`, status: 'ok', result }, HOST_ORIGIN);
        console.log(`posted response to ${this.manifest.id}`, name, result);
    }

    async dispatch<H extends HookName>(
        name: H, args: HookParam<H>
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
            this.window.postMessage({ type: `host:hook:${name}`, args }, HOST_ORIGIN);
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
