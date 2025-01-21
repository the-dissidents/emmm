
import { assert } from "./util"

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
    readonly position: number,
    readonly length: number,
    readonly info: string,
    readonly code: number,
    readonly fixes: readonly FixSuggestion[]
}

export type PositionRange = {
    start: number,
    end: number
};

export type ParagraphNode = PositionRange & {
    type: 'paragraph',
    content: InlineEntity[]
};

export type PreNode = PositionRange & {
    type: 'pre',
    content: PositionRange & {text: string}
};

export type TextNode = PositionRange & {
    type: 'text',
    content: string
};

export type EscapedNode = PositionRange & {
    type: 'escaped',
    content: string
}

export type BlockModifierNode<TState> = PositionRange & {
    type: 'block',
    mod: BlockModifierDefinition<TState>,
    state?: TState,
    head: PositionRange,
    arguments: ModifierArgument[],
    content: BlockEntity[],
    expansion?: BlockEntity[]
};

export type InlineModifierNode<TState> = PositionRange & {
    type: 'inline',
    mod: InlineModifierDefinition<TState>,
    state?: TState,
    head: PositionRange,
    arguments: ModifierArgument[],
    content: InlineEntity[],
    expansion?: InlineEntity[]
};

export type RootNode = PositionRange & {
    type: 'root'
    content: BlockEntity[]
}

export type BlockEntity = ParagraphNode | PreNode | BlockModifierNode<any>;
export type InlineEntity = TextNode | EscapedNode | InlineModifierNode<any>;
export type DocumentNode = BlockEntity | InlineEntity | RootNode;

// used in arguments only
export type InterpolationNode = PositionRange & {
    type: 'interp',
    definition: ArgumentInterpolatorDefinition,
    arg: ModifierArgument
}

export type ModifierArgument = PositionRange & {
    content: ArgumentEntity[]
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

    public delayContentExpansion = false;
    public alwaysTryExpand = false;

    public beforeParseContent?: (node: TNode, cxt: ParseContext) => Message[];
    public afterParseContent?: (node: TNode, cxt: ParseContext) => Message[];

    public beforeProcessExpansion?: (node: TNode, cxt: ParseContext) => Message[];
    public afterProcessExpansion?: (node: TNode, cxt: ParseContext) => Message[];

    public prepareExpand?: (node: TNode, cxt: ParseContext) => Message[];
    public expand?: (node: TNode, cxt: ParseContext) => TEntity[] | undefined;
}

export class BlockModifierDefinition<TState> 
    extends ModifierBase<BlockModifierNode<TState>, BlockEntity> {}

export class InlineModifierDefinition<TState> 
    extends ModifierBase<InlineModifierNode<TState>, InlineEntity> {}

export class ArgumentInterpolatorDefinition {
    constructor(
        public readonly prefix: string,
        public readonly postfix: string,
        public expand: (content: string, cxt: ParseContext) => string) 
    {}
}

export type BlockInstantiationData = {
    mod: BlockModifierDefinition<any>,
    slotContent: BlockEntity[],
    args: Map<string, string>
}

export type InlineInstantiationData = {
    mod: BlockModifierDefinition<any>,
    slotContent: InlineEntity[],
    args: Map<string, string>
}

export class ParseContext {
    constructor(
        public config: Configuration, 
        public variables = new Map<string, string>) {}

    public onConfigChange: () => void = () => {};

    #evalEntity(e: ArgumentEntity): string {
        switch (e.type) {
            case "text":
            case "escaped":
                return e.content;
            case "interp":
                const inner = this.evaluateArgument(e.arg);
                return e.definition.expand(inner, this);
            default:
                assert(false);
        }
    }

    evaluateArgument(arg: ModifierArgument): string {
        return arg.content.map((x) => this.#evalEntity(x)).join('');
    }

    // TODO: make a proper store
    public blockSlotDelayedStack: string[] = [];
    public inlineSlotDelayedStack: string[] = [];
    public blockSlotData: [string, BlockInstantiationData][] = [];
    public inlineSlotData: [string, InlineInstantiationData][] = [];
    public delayDepth = 0;
}

export class Document {
    constructor(
        public root: RootNode,
        public context: ParseContext,
        public messages: Message[]) {};
}

export interface Configuration {
    blockModifiers: Map<string, BlockModifierDefinition<any>>,
    inlineModifiers: Map<string, InlineModifierDefinition<any>>,
    argumentInterpolators: Map<string, ArgumentInterpolatorDefinition>,
    reparseDepthLimit: number
    // TODO: shorthands, strings
}

export class CustomConfiguration implements Configuration {
    blockModifiers = new Map<string, BlockModifierDefinition<any>>;
    inlineModifiers = new Map<string, InlineModifierDefinition<any>>;
    argumentInterpolators = new Map<string, ArgumentInterpolatorDefinition>;
    reparseDepthLimit = 10;
    
    constructor(from?: Configuration) {
        if (from) {
            this.blockModifiers = new Map(from.blockModifiers);
            this.inlineModifiers = new Map(from.inlineModifiers);
            this.argumentInterpolators = new Map(from.argumentInterpolators);
            this.reparseDepthLimit = from.reparseDepthLimit;
        }
    }

    addBlock(...xs: BlockModifierDefinition<any>[]) {
        for (const x of xs) {
            if (this.blockModifiers.has(x.name))
                throw Error(`block modifier already exists: ${x.name}`);
            this.blockModifiers.set(x.name, x);
        }
    }

    addInline(...xs: InlineModifierDefinition<any>[]) {
        for (const x of xs) {
            if (this.inlineModifiers.has(x.name))
                throw Error(`inline modifier already exists: ${x.name}`);
            this.inlineModifiers.set(x.name, x);
        }
    }

    addInterpolator(...xs: ArgumentInterpolatorDefinition[]) {
        for (const x of xs) {
            if (this.argumentInterpolators.has(x.prefix))
                throw Error(`interpolator already exists: ${x.prefix}`);
            this.argumentInterpolators.set(x.prefix, x);
        }
    }
}