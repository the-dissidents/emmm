import { RootNode, Message, BlockModifierDefinition, InlineModifierDefinition, SystemModifierDefinition, ArgumentInterpolatorDefinition, BlockShorthand, InlineShorthand, BlockEntity, InlineEntity, ArgumentEntity } from "./interface";
import { assert, cloneNode, ReadonlyNameManager, NameManager, stripNode } from "./util";

export interface ParseContextStoreDefinitions { }
export type ParseContextStoreKey = keyof ParseContextStoreDefinitions;
type ParseContextStoreEntry<S extends ParseContextStoreKey> = ParseContextStoreDefinitions[S];

export class ParseContext {
    private data: ParseContextStoreDefinitions = {};

    constructor(
        public config: Configuration,
        public variables = new Map<string, string>()) {
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
            stripNode(cloneNode(this.root, {withState: true}))[0] as RootNode,
            this.context, this.messages);
        return doc;
    }

    /**
     * Performs a depth-first walk of the node tree.
     */
    walk(callback: (node: BlockEntity | InlineEntity | ArgumentEntity) => 'skip' | 'break' | 'continue') {
        let nodes: (BlockEntity | InlineEntity | ArgumentEntity)[] = this.root.content;
        let node;
        while (node = nodes.shift()) {
            const result = callback(node);
            if (result == 'break') break;
            if (result == 'skip') continue;

            if ('arguments' in node)
                nodes.push(...node.arguments.flatMap((x) => x.content));
            if ('content' in node && Array.isArray(node.content))
                nodes.push(...node.content);
        }
    }

    /**
     * Gets all nodes that covers the given position, from outermost to innermost (essentially a path).
     */
    resolvePosition(pos: number): (BlockEntity | InlineEntity | ArgumentEntity)[] {
        const result: (BlockEntity | InlineEntity | ArgumentEntity)[] = [];
        let nodes: (BlockEntity | InlineEntity | ArgumentEntity)[] = this.root.content;
        let node;
        while (node = nodes.shift()) {
            if (node.location.start <= pos 
            && (node.location.actualEnd ?? node.location.end) >= pos)
            {
                result.push(node);
                nodes = [];
                if ('arguments' in node)
                    nodes.push(...node.arguments.flatMap((x) => x.content));
                if ('content' in node && Array.isArray(node.content))
                    nodes.push(...node.content);
            }
        }
        return result;
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
