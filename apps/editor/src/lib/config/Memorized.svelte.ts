console.info('MemorizedValue loading');

import { path } from "@tauri-apps/api";
import { Debug } from "../Debug";
import * as fs from "@tauri-apps/plugin-fs";
import * as z from "zod/v4-mini";

const configPath = 'memorized.json';
const memorizedData: Record<string, Memorized<unknown, unknown>> = {};
let initialized = false;
const onInitCallbacks: (() => void)[] = [];

async function ensureConfigDirectoryExists() {
    const configDir = await path.appConfigDir();
    if (!await fs.exists(configDir))
        await fs.mkdir(configDir, {recursive: true});
}

export abstract class Memorized<S, Orig = S> {
    protected subscriptions = new Set<(value: Orig) => void>();

    static $<T extends z.core.$ZodType>(key: string, ztype: T, initial: z.infer<T>) {
        if (key in memorizedData) {
            const otherType = memorizedData[key].type;
            Debug.assert(
                JSON.stringify(ztype._zod.def) === otherType,
                'type mismatch');
            return memorizedData[key] as SimpleMemorized<T>;
        }
        return new SimpleMemorized(key, ztype, initial);
    }

    static isInitialized() {
        return initialized;
    }

    static async init() {
        Debug.assert(!initialized);
        console.log('reading memorized data:', await path.appConfigDir(), configPath);
        try {
            if (!await fs.exists(configPath, {baseDir: fs.BaseDirectory.AppConfig})) {
                console.log('no memorized data found');
                return;
            }
            const obj = JSON.parse(await fs.readTextFile(
                configPath, { baseDir: fs.BaseDirectory.AppConfig }));
            for (const [key, value] of Object.entries(obj)) {
                if (key in memorizedData) {
                    memorizedData[key].deserialize(value);
                } else {
                    console.warn('unrecognized pair in memorized data file', key, value);
                }
            }
        } catch (e) {
            console.warn('error reading memorized data:', e);
        } finally {
            initialized = true;
            onInitCallbacks.forEach((x) => x());
        }
    }

    static onInitialize(callback: () => void) {
        if (initialized) callback();
        else {
            onInitCallbacks.push(callback);
        }
    }

    static async save() {
        Debug.assert(initialized);
        await ensureConfigDirectoryExists();

        const data: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(memorizedData)) {
            data[key] = value.serialize();
        }
        await fs.writeTextFile(configPath,
            JSON.stringify(data), { baseDir: fs.BaseDirectory.AppConfig });
        console.log('saved memorized values');
    }

    protected constructor(
        protected key: string,
        protected value: Orig,
    ) {
        (memorizedData[key] as Memorized<S, Orig>) = this;
    }

    protected abstract get type(): string;
    protected abstract serialize(): S;
    protected abstract deserialize(value: unknown): void;

    subscribe(subscription: (value: Orig) => void): (() => void) {
        this.subscriptions.add(subscription);
        subscription(this.get());
        return () => this.subscriptions.delete(subscription);
    }

    get(): Orig {
        return this.value;
    }

    set(value: Orig) {
        this.value = value;
        this.subscriptions.forEach((x) => x(value));
    }

    markChanged() {
        this.subscriptions.forEach((x) => x(this.value));
    }
}

export class SimpleMemorized<T extends z.core.$ZodType> extends Memorized<z.infer<T>> {
    #typeid: string;

    constructor(
        key: string,
        protected ztype: T,
        value: z.infer<T>
    ) {
        super(key, value);
        this.#typeid = JSON.stringify(ztype._zod.def);
    }

    protected override get type() {
        return this.#typeid;
    }

    protected override serialize(): z.infer<T> {
        return this.value;
    }

    protected override deserialize(value: unknown) {
        const result = z.safeParse(this.ztype, value);
        if (!result.success)
            console.warn('type mismatch in memorized data file',
                this.key, value, z.prettifyError(result.error));
        else
            this.set(result.data);
    }
}
