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

interface StoreBase<Orig> {
    subscribe(subscription: (value: Orig) => void): (() => void);
    get(): Orig;
    set(value: Orig): void;
    markChanged(): void;
}

abstract class Store<Orig> {
    abstract subscribe(subscription: (value: Orig) => void): (() => void);
    abstract get(): Orig;
    abstract set(value: Orig): void;
    abstract markChanged(): void;

    field<Name extends keyof Orig>(name: Name): Store<Orig[Name]> {
        return new AnonymousStore({
            subscribe: (subscription: (value: Orig[Name]) => void): (() => void) => {
                const s = (v: Orig) => subscription(v[name]);
                return this.subscribe(s);
            },
            get: () => this.get()[name],
            set: (value: Orig[Name]) => {
                this.get()[name] = value;
                this.markChanged();
            },
            markChanged: () => this.markChanged()
        });
    }

    toNonoptional() {
        return this as Store<Orig extends undefined ? never : Orig>;
    }
}

export class AnonymousStore<Orig> extends Store<Orig> {
    subscribe(subscription: (value: Orig) => void): (() => void) {
        return this.base.subscribe(subscription);
    }
    get(): Orig {
        return this.base.get();
    }
    set(value: Orig): void {
        return this.base.set(value);
    }
    markChanged(): void {
        this.base.markChanged();
    }

    constructor(private base: StoreBase<Orig>) {
        super();
    }
}

export abstract class Memorized<S, Orig = S> extends Store<Orig> {
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

    static $dict<TKey extends z.core.$ZodType, T extends z.core.$ZodType>(
        key: string,
        zkey: TKey,
        zval: T,
        initial?: Map<z.infer<TKey>, z.infer<T>>
    ) {
        if (key in memorizedData) {
            const zout = z.array(z.tuple([z.nonoptional(zkey), z.nonoptional(zval)]));
            Debug.assert(
                JSON.stringify(zout._zod.def) === (memorizedData[key] as any).type,
                'type mismatch');
            return memorizedData[key] as DictMemorized<TKey, T>;
        }
        return new DictMemorized(key, zkey, zval, initial);
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
        super();
        (memorizedData[key] as Memorized<S, Orig>) = this;
    }

    /** should be the JSON stringify result of the `._zod.def` of your stored object's zod type */
    protected abstract get type(): string;
    protected abstract serialize(): S;
    protected abstract deserialize(value: unknown): void;

    override subscribe(subscription: (value: Orig) => void): (() => void) {
        this.subscriptions.add(subscription);
        subscription(this.get());
        return () => this.subscriptions.delete(subscription);
    }

    override get(): Orig {
        return this.value;
    }

    override set(value: Orig) {
        this.value = value;
        this.markChanged();
    }

    override markChanged() {
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

export class DictMemorized<
    TKey extends z.core.$ZodType,
    T extends z.core.$ZodType
> extends Memorized<
    [z.infer<TKey>, z.infer<T>][],
    Map<z.infer<TKey>, z.infer<T>>
> {
    protected readonly zout;
    #typeid: string;

    constructor(
        key: string,
        protected zkey: TKey,
        protected zval: T,
        value: Map<z.infer<TKey>, z.infer<T>> = new Map()
    ) {
        super(key, value);
        this.zout = z.array(z.tuple([z.nonoptional(zkey), z.nonoptional(zval)]));
        this.#typeid = JSON.stringify(this.zout._zod.def);
    }

    protected override get type() {
        return this.#typeid;
    }

    protected override serialize() {
        return [...this.value.entries()];
    }

    item(key: z.infer<TKey>) {
        return new AnonymousStore({
            subscribe: (subscription: (value?: z.infer<T>) => void): (() => void) => {
                const s = (v: Map<z.infer<TKey>, z.infer<T>>) => subscription(v.get(key));
                return this.subscribe(s);
            },
            get: () => this.value.get(key),
            set: (value: z.infer<T>) => {
                this.value.set(key, value);
                this.markChanged();
            },
            markChanged: () => this.markChanged()
        });
    }

    protected override deserialize(value: unknown) {
        if (typeof value !== 'object' || value === null) {
            console.warn('dict memorized: expected object, got', value);
            return;
        }
        const result = z.safeParse(this.zout, value);
        if (!result.success) console.warn('type mismatch in dict memorized data file',
            this.key, z.prettifyError(result.error));
        else
            this.set(new Map(result.data));
    }
}
