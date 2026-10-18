import type { CommandName } from "./Types"
import type { PluginCommandHandler } from "./Plugin.svelte"
import * as dialog from "@tauri-apps/plugin-dialog";
import * as fs from "@tauri-apps/plugin-fs";
import { Debug } from "$lib/Debug";

let counter = $state(0);

export const PluginCommandHandlers: { readonly [C in CommandName]: PluginCommandHandler<C> } = {
    'counter': () => ({ data: counter++ }),
    'get': (key, inst) => ({ data: inst.getConfig(key) }),
    'set': ({key, value}, inst) => {
        const ok = inst.setConfig(key, value);
        Debug.assert(ok);
        return { data: undefined };
    },
    'log': (p, inst) => {
        console.log(`[Plugin ${inst.manifest.id}]`, p);
        return { data: undefined };
    },
    'warn': (p, inst) => {
        console.warn(`[Plugin ${inst.manifest.id}]`, p);
        return { data: undefined };
    },
    'error': (p, inst) => {
        console.error(`[Plugin ${inst.manifest.id}]`, p);
        return { data: undefined };
    },
    'read-text-file': async (path) => {
        try {
            return { data: await fs.readTextFile(path) };
        } catch {
            return { data: null };
        }
    },
    'read-binary-file': async (path) => {
        try {
            const array = await fs.readFile(path);
            return { data: array, transfer: [array.buffer] };
        } catch {
            return { data: null };
        }
    },
    'messagebox': async ({ msg, title, kind }) =>
        ({ data: await dialog.message(msg, { title, kind }) }),
};
