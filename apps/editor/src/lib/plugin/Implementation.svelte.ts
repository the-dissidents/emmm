import type { CommandName } from "./Types"
import type { PluginCommandHandler } from "./Plugin.svelte"
import * as dialog from "@tauri-apps/plugin-dialog";
import { Debug } from "$lib/Debug";

let counter = $state(0);

export const PluginCommandHandlers: { readonly [C in CommandName]: PluginCommandHandler<C> } = {
    'counter': () => counter++,
    'get': (key, inst) => inst.getConfig(key),
    'set': ({key, value}, inst) => {
        const ok = inst.setConfig(key, value);
        Debug.assert(ok);
    },
    'log': (p, inst) => console.log(`[Plugin ${inst.manifest.id}]`, p),
    'warn': (p, inst) => console.warn(`[Plugin ${inst.manifest.id}]`, p),
    'error': (p, inst) => console.error(`[Plugin ${inst.manifest.id}]`, p),
    'messagebox': async ({ msg, title, kind }) => {
        return await dialog.message(msg, { title, kind });
    },
};
