
import { debug } from "./debug";
import { assert, cloneNode, NameManager, ReadonlyNameManager } from "./util";

// The scanner of any implementation should be capable of handling UTF-8 
// strings at least as well as Typescript.
export interface Scanner {
    position(): number,
    isEOF(): boolean,

    // return true if sees str immediately
    peek(str: string): boolean,

    // if sees str immediately, consumes it and returns true
    accept(str: string): boolean,

    // consumes a character and returns it; throws at EOF
    acceptChar(): string,

    // newlines are NOT whitespaces
    acceptWhitespaceChar(): string | null,

    // returns null if encountered EOF before str
    acceptUntil(str: string): string | null
}

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
}

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

export class Document {
    constructor(
        public readonly root: RootNode,
        public readonly context: ParseContext,
        public readonly messages: readonly Message[]) {};
    
    toStripped() {
        function stripNode(node: DocumentNode): DocumentNode[] {
            switch (node.type) {
                case NodeType.Preformatted:
                case NodeType.Text:
                case NodeType.Escaped:
                    return [node];
                case NodeType.BlockModifier:
                case NodeType.InlineModifier:
                    if (node.expansion !== undefined)
                        return node.expansion.flatMap((x) => stripNode(x));
                case NodeType.Paragraph:
                case NodeType.Root:
                    node.content = node.content.flatMap((x) => stripNode(x)) as any;
                    return [node];
                case NodeType.SystemModifier:
                    return [];
                default:
                    return debug.never(node);
            }
        }
        let doc = new Document(
            stripNode(cloneNode(this.root))[0] as RootNode, this.context, this.messages);
        return doc;
    }
}

export interface ReadonlyConfiguration {
    initializers: readonly ((cxt: ParseContext) => void)[];
    blockModifiers: ReadonlyNameManager<BlockModifierDefinition<any>>;
    inlineModifiers: ReadonlyNameManager<InlineModifierDefinition<any>>;
    systemModifiers: ReadonlyNameManager<SystemModifierDefinition<any>>;
    argumentInterpolators: ReadonlyNameManager<ArgumentInterpolatorDefinition>;

    blockShorthands: ReadonlyNameManager<BlockShorthand<any>>;
    inlineShorthands: ReadonlyNameManager<InlineShorthand<any>>;
    reparseDepthLimit: number;
}

export class Configuration implements ReadonlyConfiguration {
    initializers: ((cxt: ParseContext) => void)[] = [];
    blockModifiers: NameManager<BlockModifierDefinition<any>>;
    inlineModifiers: NameManager<InlineModifierDefinition<any>>;
    systemModifiers: NameManager<SystemModifierDefinition<any>>;
    argumentInterpolators: NameManager<ArgumentInterpolatorDefinition>;

    blockShorthands: NameManager<BlockShorthand<any>>;
    inlineShorthands: NameManager<InlineShorthand<any>>;
    reparseDepthLimit = 10;
    
    constructor(from?: ReadonlyConfiguration) {
        this.blockModifiers = new NameManager(from?.blockModifiers);
        this.inlineModifiers = new NameManager(from?.inlineModifiers);
        this.systemModifiers = new NameManager(from?.systemModifiers);
        this.argumentInterpolators = new NameManager(from?.argumentInterpolators);
        this.blockShorthands = new NameManager(from?.blockShorthands);
        this.inlineShorthands = new NameManager(from?.inlineShorthands);
        if (from) {
            this.initializers = [...from.initializers];
            this.reparseDepthLimit = from.reparseDepthLimit;
        }
    }
}
