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

export type NodeBase = {
    start: number,
    end: number
};

export type ParagraphNode = NodeBase & {
    type: 'paragraph',
    content: InlineEntity[]
};

export type PreNode = NodeBase & {
    type: 'pre',
    content: NodeBase & {text: string}
};

export type ModifierArgument = NodeBase & {
    name: string | undefined,
    content: string // TODO: arg nodes
}

export type BlockModifierNode = NodeBase & {
    type: 'block',
    id: string,
    head: NodeBase,
    arguments: ModifierArgument[],
    content: BlockEntity[]
};

export type TextNode = NodeBase & {
    type: 'text',
    content: string
};

export type EscapedNode = NodeBase & {
    type: 'escaped',
    content: string
}

export type InlineModifierNode = NodeBase & {
    type: 'inline',
    id: string,
    head: NodeBase,
    arguments: ModifierArgument[],
    content: InlineEntity[]
};

export type RootNode = NodeBase & {
    type: 'root'
    content: BlockEntity[]
}

export type BlockEntity = ParagraphNode | PreNode | BlockModifierNode;
export type InlineEntity = TextNode | EscapedNode | InlineModifierNode;
export type Node = BlockEntity | InlineEntity | RootNode;

export enum ModifierFlags {
    Normal = 0,
    /** Content is preformatted: no escaping, no inner tags */
    Preformatted = 1,
    /** No content slot */
    Marker = 2
}

export class BlockModifierDefinition {
    constructor(
        public readonly name: string, 
        public readonly flags: ModifierFlags = ModifierFlags.Normal,
        args?: Partial<BlockModifierDefinition>) 
    {
        if (args) Object.assign(this, args);
    }
    
    public parse?: (node: BlockModifierNode, cxt: ParseContext) => Message[];
    public expand?: (node: BlockModifierNode, cxt: ParseContext) => BlockEntity[];
}

export class InlineModifierDefinition {
    constructor(
        public readonly name: string, 
        public readonly flags: ModifierFlags = ModifierFlags.Normal,
        args?: Partial<InlineModifierDefinition>) 
    {
        if (args) Object.assign(this, args);
    }
    
    public parse?: (node: InlineModifierNode, cxt: ParseContext) => Message[];
    public expand?: (node: InlineModifierNode, cxt: ParseContext) => InlineEntity[];
}

export class ParseContext {
    constructor(
        public config: Configuration, 
        public variables = new Map<string, string>) {}

    public onConfigChange: () => void = () => {};
    // TODO: handle slots
}

export class Document {
    constructor(
        public root: RootNode,
        public context: ParseContext,
        public messages: Message[]) {};
}

export interface Configuration {
    blockModifiers: Map<string, BlockModifierDefinition>,
    inlineModifiers: Map<string, InlineModifierDefinition>

    // TODO: shorthands, strings
}

export class CustomConfiguration implements Configuration {
    private blocks = new Map<string, BlockModifierDefinition>;
    private inlines = new Map<string, InlineModifierDefinition>;
    
    constructor(from?: Configuration) {
        if (from) {
            this.blocks = new Map(from.blockModifiers);
            this.inlines = new Map(from.inlineModifiers);
        }
    }

    get blockModifiers(): Map<string, BlockModifierDefinition> {
        return this.blocks;
    }

    get inlineModifiers(): Map<string, InlineModifierDefinition> {
        return this.inlines;
    }

    addBlock(...xs: BlockModifierDefinition[]) {
        for (const x of xs) {
            if (this.blocks.has(x.name))
                throw Error(`block modifier already exists: ${x.name}`);
            this.blocks.set(x.name, x);
        }
    }

    addInline(...xs: InlineModifierDefinition[]) {
        for (const x of xs) {
            if (this.inlines.has(x.name))
                throw Error(`block modifier already exists: ${x.name}`);
            this.inlines.set(x.name, x);
        }
    }
}