// The scanner of any implementation should be capable of handling UTF-8 

import { assert } from "./util"

// strings at least as well as Typescript.
export interface Scanner {
    position(): number,
    isEOF(): boolean,

    // return true if sees str immediately
    // TODO: change the interface to use a prefix tree
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

export type ModifierArgument = PositionRange & {
    name: string | undefined,
    content: string // TODO: arg nodes
}

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
export type Node = BlockEntity | InlineEntity | RootNode;

export enum ModifierFlags {
    Normal = 0,
    /** Content is preformatted: no escaping, no inner tags */
    Preformatted = 1,
    /** No content slot */
    Marker = 2
}

export class BlockModifierDefinition<TState> {
    constructor(
        public readonly name: string, 
        public readonly flags: ModifierFlags = ModifierFlags.Normal,
        args?: Partial<BlockModifierDefinition<TState>>) 
    {
        if (args) Object.assign(this, args);
    }
    
    public beforeParse?: 
        (node: BlockModifierNode<TState>, cxt: ParseContext) => Message[];
    public afterParse?: 
        (node: BlockModifierNode<TState>, cxt: ParseContext) => Message[];
    public expand?: 
        (node: BlockModifierNode<TState>, cxt: ParseContext) => BlockEntity[];
    public beforeReparse?: 
        (node: BlockModifierNode<TState>, cxt: ParseContext) => Message[];
    public afterReparse?: 
        (node: BlockModifierNode<TState>, cxt: ParseContext) => Message[];
}

export class InlineModifierDefinition<TState>  {
    constructor(
        public readonly name: string, 
        public readonly flags: ModifierFlags = ModifierFlags.Normal,
        args?: Partial<InlineModifierDefinition<TState>>) 
    {
        if (args) Object.assign(this, args);
    }
    
    public readonly emptyState?: () => TState;
    public beforeParse?: 
        (node: InlineModifierNode<TState>, cxt: ParseContext) => Message[];
    public afterParse?: 
        (node: InlineModifierNode<TState>, cxt: ParseContext) => Message[];
    public expand?: 
        (node: InlineModifierNode<TState>, cxt: ParseContext) => InlineEntity[];
    public beforeReparse?: 
        (node: InlineModifierNode<TState>, cxt: ParseContext) => Message[];
    public afterReparse?: 
        (node: InlineModifierNode<TState>, cxt: ParseContext) => Message[];
}

export type BlockInstantiationData = {
    mod: BlockModifierDefinition<any>,
    args: string[]
}

export type InlineInstantiationData = {
    mod: BlockModifierDefinition<any>,
    args: string[]
}

export class ParseContext {
    constructor(
        public config: Configuration, 
        public variables = new Map<string, string>) {}

    public onConfigChange: () => void = () => {};

    public blockSlotInDefinition: string[] = [];
    public inlineSlotInDefinition: string[] = [];
    public blockSlotData: [string, BlockInstantiationData][] = [];
    public inlineSlotData: [string, InlineInstantiationData][] = [];
    public expandableDepth = 0;
}

export class Document {
    constructor(
        public root: RootNode,
        public context: ParseContext,
        public messages: Message[]) {};
}

export interface Configuration {
    blockModifiers: Map<string, BlockModifierDefinition<any>>,
    inlineModifiers: Map<string, InlineModifierDefinition<any>>
    reparseDepthLimit: number
    // TODO: shorthands, strings
}

export class CustomConfiguration implements Configuration {
    private blocks = new Map<string, BlockModifierDefinition<any>>;
    private inlines = new Map<string, InlineModifierDefinition<any>>;
    public reparseDepthLimit = 10;
    
    constructor(from?: Configuration) {
        if (from) {
            this.blocks = new Map(from.blockModifiers);
            this.inlines = new Map(from.inlineModifiers);
        }
    }

    get blockModifiers(): Map<string, BlockModifierDefinition<any>> {
        return this.blocks;
    }

    get inlineModifiers(): Map<string, InlineModifierDefinition<any>> {
        return this.inlines;
    }

    addBlock(...xs: BlockModifierDefinition<any>[]) {
        for (const x of xs) {
            if (this.blocks.has(x.name))
                throw Error(`block modifier already exists: ${x.name}`);
            this.blocks.set(x.name, x);
        }
    }

    addInline(...xs: InlineModifierDefinition<any>[]) {
        for (const x of xs) {
            if (this.inlines.has(x.name))
                throw Error(`block modifier already exists: ${x.name}`);
            this.inlines.set(x.name, x);
        }
    }
}