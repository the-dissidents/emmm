import { path } from "@tauri-apps/api";
import { BaseDirectory } from "@tauri-apps/plugin-fs";
import * as fs from "@tauri-apps/plugin-fs"
import { assert } from "./Debug";
import { get, writable, type Writable } from "svelte/store";
import { z } from "zod/v4-mini";

export class Store<T extends {[key: string]: string | number | Map<string, string>}> {
    #ztype: z.core.$ZodType;
    #stores: {[key in keyof T]: Writable<T[key]>};
    #initializing = false;
    #saving = false;

    constructor(public readonly name: string, _default: T) {
        this.#stores = {} as any;
        let types: Record<string, z.core.$ZodType> = {};
        for (const key in _default) {
            this.#stores[key] = writable(_default[key]);
            this.#stores[key].subscribe((x) => {
                if (!this.#initializing && !this.#saving)
                    this.save();
            })
            types[key] = 
                  typeof _default[key] == 'string' ? z.string()
                : typeof _default[key] == 'number' ? z.number()
                : z.record(z.string(), z.string());
        }
        this.#ztype = z.object(types);
    }

    async init() {
        this.#initializing = true;
        let configPath = this.name + '.json';
        try {
            if (!await fs.exists(configPath, {baseDir: BaseDirectory.AppConfig}))
                console.log('no config file found')
            else {
                const json = JSON.parse(await fs.readTextFile(
                    configPath, {baseDir: BaseDirectory.AppConfig}));
                z.parse(this.#ztype, json);
                for (const key in this.#stores) {
                    if (!(key in json)) continue;
                    const got = get(this.#stores[key]);
                    if (got instanceof Map) {
                        if (typeof json[key] != 'object') continue;
                        for (const k2 in json[key]) {
                            if (typeof json[key][k2] == 'string')
                                got.set(k2, json[key][k2]);
                            else
                                console.warn('skipped subkey', k2);
                        }
                    }
                    if (typeof got == typeof json[key]) {
                        this.#stores[key].set(json[key]);
                    } else
                        console.warn('skipped key', key, got, json[key]);
                }
            }
        } catch (e) {
            console.error('error reading config file:', e);
        } finally {
            this.#initializing = false;
        }
    }

    async save() {
        if (this.#saving) return;
        
        this.#saving = true;
        let configPath = this.name + '.json';
        const configDir = await path.appConfigDir();
        if (!await fs.exists(configDir))
            await fs.mkdir(configDir, {recursive: true});
        let data = {} as T;
        for (const key in this.#stores)
            data[key] = get(this.#stores[key]);
        await fs.writeTextFile(configPath, 
            JSON.stringify(data, (_, value) => {
                if (value instanceof Map)
                    return Object.fromEntries(value.entries());
                return value;
            }), {baseDir: BaseDirectory.AppConfig});
        console.log('saved config');
        this.#saving = false;
    }

    async deleteSave() {
        let configPath = this.name + '.json';
        if (!await fs.exists(configPath, { baseDir: BaseDirectory.AppConfig }))
            return;
        await fs.remove(configPath, { baseDir: BaseDirectory.AppConfig });
    }

    $<K extends keyof T>(key: K): Writable<T[K]> {
        return this.#stores[key];
    }

    get<K extends keyof T>(key: K) {
        return get(this.$(key));
    }

    set<K extends keyof T>(key: K, value: T[K]) {
        this.$(key).set(value);
    }
}