
import { debug } from "./debug";
import { assert, cloneNode, NameManager, ReadonlyNameManager } from "./util";

export enum MessageSeverity {
    Info,
    Warning,
    Error
}

// Fixes are optional language-server features
export type FixSuggestion = {
    info: string,
    apply(src: string, cursor: number): [out_src: string, new_cursor: number]
}

export type Message = {
    readonly severity: MessageSeverity,
    readonly start: number,
    readonly end: number,
    readonly info: string,
    readonly code: number,
    readonly fixes: readonly FixSuggestion[]
}

export type PositionRange = {
    start: number,
    end: number,
    // eh...
    actualEnd?: number
};

export enum NodeType {
    Root,
    Paragraph,
    Preformatted,
    Text,
    Escaped,
    SystemModifier,
    InlineModifier,
    BlockModifier,
    Interpolation
}

export type ParagraphNode = PositionRange & {
    type: NodeType.Paragraph,
    content: InlineEntity[]
};

export type PreNode = PositionRange & {
    type: NodeType.Preformatted,
    content: PositionRange & {text: string}
};

export type TextNode = PositionRange & {
    type: NodeType.Text,
    content: string
};

export type EscapedNode = PositionRange & {
    type: NodeType.Escaped,
    content: string
}

export type SystemModifierNode<TState> = PositionRange & {
    type: NodeType.SystemModifier,
    mod: SystemModifierDefinition<TState>,
    state?: TState,
    head: PositionRange,
    arguments: ModifierArgument[],
    content: BlockEntity[],
    expansion?: never[]
};

export type BlockModifierNode<TState> = PositionRange & {
    type: NodeType.BlockModifier,
    mod: BlockModifierDefinition<TState>,
    state?: TState,
    head: PositionRange,
    arguments: ModifierArgument[],
    content: BlockEntity[],
    expansion?: BlockEntity[]
};

export type InlineModifierNode<TState> = PositionRange & {
    type: NodeType.InlineModifier,
    mod: InlineModifierDefinition<TState>,
    state?: TState,
    head: PositionRange,
    arguments: ModifierArgument[],
    content: InlineEntity[],
    expansion?: InlineEntity[]
};

export type RootNode = PositionRange & {
    type: NodeType.Root
    content: BlockEntity[]
}

export type ModifierNode<T = any> = 
    BlockModifierNode<T> | InlineModifierNode<T> | SystemModifierNode<T>;
export type BlockEntity = 
    ParagraphNode | PreNode | BlockModifierNode<any> | SystemModifierNode<any>;
export type InlineEntity = 
    TextNode | EscapedNode | InlineModifierNode<any> | SystemModifierNode<any>;
export type DocumentNode = 
    BlockEntity | InlineEntity | RootNode;

// used in arguments only
export type InterpolationNode = PositionRange & {
    type: NodeType.Interpolation,
    definition: ArgumentInterpolatorDefinition,
    argument: ModifierArgument,
    expansion?: string
}

export type ModifierArgument = PositionRange & {
    content: ArgumentEntity[]
    expansion?: string
}

export type ArgumentEntity = TextNode | EscapedNode | InterpolationNode;

export enum ModifierFlags {
    Normal = 0,
    /** Content is preformatted: no escaping, no inner tags */
    Preformatted = 1,
    /** No content slot */
    Marker = 2
}

class ModifierBase<TNode, TEntity> {
    constructor(
        public readonly name: string, 
        public readonly flags: ModifierFlags = ModifierFlags.Normal,
        args?: Partial<ModifierBase<TNode, TEntity>>) 
    {
        if (args) Object.assign(this, args);
    }

    roleHint?: string
    delayContentExpansion = false;
    alwaysTryExpand = false;

    beforeParseContent?: (node: TNode, cxt: ParseContext, immediate: boolean) => Message[];
    afterParseContent?: (node: TNode, cxt: ParseContext, immediate: boolean) => Message[];

    beforeProcessExpansion?: (node: TNode, cxt: ParseContext, immediate: boolean) => Message[];
    afterProcessExpansion?: (node: TNode, cxt: ParseContext, immediate: boolean) => Message[];

    prepareExpand?: (node: TNode, cxt: ParseContext, immediate: boolean) => Message[];
    expand?: (node: TNode, cxt: ParseContext, immediate: boolean) => TEntity[] | undefined;
}

export class BlockModifierDefinition<TState> 
    extends ModifierBase<BlockModifierNode<TState>, BlockEntity> {}

export class InlineModifierDefinition<TState> 
    extends ModifierBase<InlineModifierNode<TState>, InlineEntity> {}

export class SystemModifierDefinition<TState> 
    extends ModifierBase<SystemModifierNode<TState>, never> {}

export class ArgumentInterpolatorDefinition {
    constructor(
        public readonly name: string,
        public readonly postfix: string,
        args?: Partial<ArgumentInterpolatorDefinition>) 
    {
        if (args) Object.assign(this, args);
    }

    alwaysTryExpand = false;
    expand?: (content: string, cxt: ParseContext, immediate: boolean) => string | undefined;
}

type Shorthand<TMod> = {
    name: string,
    parts: readonly string[],
    postfix: string | undefined,
    mod: TMod
};

export type BlockShorthand<TState> = Shorthand<BlockModifierDefinition<TState>>;
export type InlineShorthand<TState> = Shorthand<InlineModifierDefinition<TState>>;

export interface ParseContextStoreDefinitions {} 
export type ParseContextStoreKey = keyof ParseContextStoreDefinitions;
type ParseContextStoreEntry<S extends ParseContextStoreKey> = ParseContextStoreDefinitions[S];

export class ParseContext {
    private data: ParseContextStoreDefinitions = {};

    constructor(
        public config: Configuration, 
        public variables = new Map<string, string>)
    {
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

/// Warning: modifies the original nodes
export function stripNode(...nodes: DocumentNode[]): DocumentNode[] {
    return nodes.flatMap((node) => {
        switch (node.type) {
            case NodeType.Preformatted:
            case NodeType.Text:
            case NodeType.Escaped:
                return [node];
            case NodeType.BlockModifier:
            case NodeType.InlineModifier:
                if (node.expansion !== undefined)
                    return node.expansion.flatMap((x) => stripNode(x));
                // else fallthrough!
            case NodeType.Paragraph:
            case NodeType.Root:
                node.content = node.content.flatMap((x) => stripNode(x)) as any;
                return [node];
            case NodeType.SystemModifier:
                return [];
            default:
                return debug.never(node);
        }
    });
}

export class Document {
    constructor(
        public readonly root: RootNode,
        public readonly context: ParseContext,
        public readonly messages: readonly Message[]) {};
    
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

