import { RootNode, Message, BlockModifierDefinition, InlineModifierDefinition, SystemModifierDefinition, ArgumentInterpolatorDefinition, BlockShorthand, InlineShorthand } from "./interface";
import { assert, cloneNode, ReadonlyNameManager, NameManager, stripNode } from "./util";

export interface ParseContextStoreDefinitions { }
export type ParseContextStoreKey = keyof ParseContextStoreDefinitions;
type ParseContextStoreEntry<S extends ParseContextStoreKey> = ParseContextStoreDefinitions[S];

export class ParseContext {
    private data: ParseContextStoreDefinitions = {};

    constructor(
        public config: Configuration,
        public variables = new Map<string, string>) {
        config.initializers.forEach((x) => x(this));
    }

    init<S extends ParseContextStoreKey>(key: S, obj: ParseContextStoreEntry<S>) {
        assert(!(key in this.data));
        this.data[key] = obj;
    }

    set<S extends ParseContextStoreKey>(key: S, obj: ParseContextStoreEntry<S>) {
        assert(key in this.data);
        this.data[key] = obj;
    }

    get<S extends ParseContextStoreKey>(key: S): ParseContextStoreEntry<S> {
        assert(key in this.data);
        return this.data[key];
    }
}

export class Document {
    constructor(
        public readonly root: RootNode,
        public readonly context: ParseContext,
        public readonly messages: readonly Message[]) { };

    toStripped() {
        let doc = new Document(
            stripNode(cloneNode(this.root, undefined, true))[0] as RootNode,
            this.context, this.messages);
        return doc;
    }
}

export interface ReadonlyConfiguration {
    readonly initializers: readonly ((cxt: ParseContext) => void)[];
    readonly blockModifiers: ReadonlyNameManager<BlockModifierDefinition<any>>;
    readonly inlineModifiers: ReadonlyNameManager<InlineModifierDefinition<any>>;
    readonly systemModifiers: ReadonlyNameManager<SystemModifierDefinition<any>>;
    readonly argumentInterpolators: ReadonlyNameManager<ArgumentInterpolatorDefinition>;

    readonly blockShorthands: ReadonlyNameManager<BlockShorthand<any>>;
    readonly inlineShorthands: ReadonlyNameManager<InlineShorthand<any>>;
    readonly reparseDepthLimit: number;
}

export class Configuration implements ReadonlyConfiguration {
    initializers: ((cxt: ParseContext) => void)[] = [];
    blockModifiers = new NameManager<BlockModifierDefinition<any>>;
    inlineModifiers = new NameManager<InlineModifierDefinition<any>>;
    systemModifiers = new NameManager<SystemModifierDefinition<any>>;
    argumentInterpolators = new NameManager<ArgumentInterpolatorDefinition>;

    blockShorthands = new NameManager<BlockShorthand<any>>;
    inlineShorthands = new NameManager<InlineShorthand<any>>;
    reparseDepthLimit = 10;

    static from(from: ReadonlyConfiguration) {
        let config = new Configuration();
        config.initializers = [...from.initializers];
        config.reparseDepthLimit = from.reparseDepthLimit;
        config.blockModifiers = new NameManager(from.blockModifiers);
        config.inlineModifiers = new NameManager(from.inlineModifiers);
        config.systemModifiers = new NameManager(from.systemModifiers);
        config.argumentInterpolators = new NameManager(from.argumentInterpolators);
        config.blockShorthands = new NameManager(from.blockShorthands);
        config.inlineShorthands = new NameManager(from.inlineShorthands);
        return config;
    }
}
