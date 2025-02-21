
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
        }
        let doc = new Document(
            stripNode(cloneNode(this.root, undefined, true))[0] as RootNode, this.context, this.messages);
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

export type RendererType<TState, TReturn> = {
    state: TState,
    return: TReturn
};

type getState<Type> = Type extends RendererType<infer T, any> ? T : never;
type getReturn<Type> = Type extends RendererType<any, infer T> ? T : never;

export type NodeRenderer<Type extends RendererType<any, any>, TNode> =
    (node: TNode, cxt: RenderContext<Type>) => getReturn<Type>;

export type NodeRendererDefinition<Type extends RendererType<any, any>, TNode, TDef> = 
    [def: TDef, renderer: NodeRenderer<Type, TNode>];

export class RenderContext<Type extends RendererType<any, any>> {
    renderEntity(node: BlockEntity | InlineEntity): getReturn<Type> | undefined {
        switch (node.type) {
            case NodeType.Paragraph:
                return this.config.paragraphRenderer?.(node, this);
            case NodeType.Preformatted:
            case NodeType.Text:
            case NodeType.Escaped:
                return this.config.textRenderer?.(node, this);
            case NodeType.InlineModifier:
                let ir = this.config.inlineRenderers.get(node.mod);
                if (ir) return ir(node, this);
                return this.config.undefinedInlineRenderer?.(node, this);
            case NodeType.BlockModifier:
                let br = this.config.blockRenderers.get(node.mod);
                if (br) return br(node, this);
                return this.config.undefinedBlockRenderer?.(node, this);
            case NodeType.SystemModifier:
                return undefined;
            default:
                return debug.never(node);
        }
    }

    constructor(
        public readonly config: RenderConfiguration<Type>,
        public readonly parseContext: ParseContext,
        public state: getState<Type>) {}
}

export interface ReadonlyRenderConfiguration<Type extends RendererType<any, any>> {
    readonly paragraphRenderer?: NodeRenderer<Type, ParagraphNode>;
    readonly textRenderer?: NodeRenderer<Type, TextNode | PreNode | EscapedNode>;

    readonly undefinedBlockRenderer?: NodeRenderer<Type, BlockModifierNode<any>>;
    readonly undefinedInlineRenderer?: NodeRenderer<Type, InlineModifierNode<any>>;

    readonly blockRenderers: ReadonlyMap<
        BlockModifierDefinition<any>, 
        NodeRenderer<Type, BlockModifierNode<any>>>;
    readonly inlineRenderers: ReadonlyMap<
        InlineModifierDefinition<any>, 
        NodeRenderer<Type, InlineModifierNode<any>>>;

    readonly postprocessor: 
        (results: getReturn<Type>[], cxt: RenderContext<Type>) => getReturn<Type>;
    
    render(doc: Document, state: getState<Type>): getReturn<Type>;
}

export type BlockRendererDefiniton<Type extends RendererType<any, any>, ModState = any> = 
    NodeRendererDefinition<Type, BlockModifierNode<ModState>, BlockModifierDefinition<ModState>>;

export type InlineRendererDefiniton<Type extends RendererType<any, any>, ModState = any> = 
    NodeRendererDefinition<Type, InlineModifierNode<ModState>, InlineModifierDefinition<ModState>>;

export class RenderConfiguration<Type extends RendererType<any, any>>
    implements ReadonlyRenderConfiguration<Type>
{
    paragraphRenderer?: NodeRenderer<Type, ParagraphNode>;
    textRenderer?: NodeRenderer<Type, TextNode | PreNode | EscapedNode>;

    undefinedBlockRenderer?: NodeRenderer<Type, BlockModifierNode<any>>;
    undefinedInlineRenderer?: NodeRenderer<Type, InlineModifierNode<any>>;

    blockRenderers = new Map<
        BlockModifierDefinition<any>, 
        NodeRenderer<Type, BlockModifierNode<any>>>;
    inlineRenderers = new Map<
        InlineModifierDefinition<any>, 
        NodeRenderer<Type, InlineModifierNode<any>>>;
    
    constructor(
        public postprocessor: 
            (results: getReturn<Type>[], cxt: RenderContext<Type>) => getReturn<Type>) {}

    render(doc: Document, state: getState<Type>): getReturn<Type> {
        let cxt = new RenderContext(this, doc.context, state);
        let results = doc.toStripped()
            .root.content
            .map((x) => cxt.renderEntity(x))
            // not exactly sure why 'as' is needed here
            .filter((x) => (x !== undefined)) as getReturn<Type>[];
        return this.postprocessor(results, cxt);
    }

    addBlockRenderer(...rs: BlockRendererDefiniton<Type>[]) {
        rs.forEach(([x, y]) => this.blockRenderers.set(x, y));
    }

    addInlineRenderer(...rs: InlineRendererDefiniton<Type>[]) {
        rs.forEach(([x, y]) => this.inlineRenderers.set(x, y));
    }

    static from<Type extends RendererType<any, any>>(from: ReadonlyRenderConfiguration<Type>) {
        let config = new RenderConfiguration(from.postprocessor);
        config.paragraphRenderer = from.paragraphRenderer;
        config.textRenderer = from.textRenderer;
        config.undefinedBlockRenderer = from.undefinedBlockRenderer;
        config.undefinedInlineRenderer = from.undefinedInlineRenderer;
        config.inlineRenderers = new Map(from.inlineRenderers);
        config.blockRenderers = new Map(from.blockRenderers);
        return config;
    }
}