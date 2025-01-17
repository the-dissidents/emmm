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

export class Document {
    constructor(
        public root: RootNode, 
        public messages: Message[]) {};
}

type NodeWithBlockContent = RootNode | BlockModifierNode;
type NodeWithInlineContent = InlineModifierNode | ParagraphNode;

export class EmitEnvironment {
    private document: RootNode = {type: 'root', start: 0, end: -1, content: []};
    private messages: Message[] = [];
    private blockStack: NodeWithBlockContent[] = [this.document];
    private inlineStack: NodeWithInlineContent[] = [];
    constructor(private scanner: Scanner) {}

    get tree(): Document {
        return new Document(this.document, this.messages);
    }

    message(m: Message) {
        this.messages.push(m);
    }

    addBlockNode(n: BlockEntity) {
        assert(this.blockStack.length > 0);
        this.blockStack.at(-1)!.content.push(n);
        return n;
    }

    addInlineNode(n: InlineEntity) {
        assert(this.inlineStack.length > 0);
        this.inlineStack.at(-1)!.content.push(n);
        return n;
    }

    addString(str: string) {
        assert(this.inlineStack.length > 0);
        const content = this.inlineStack.at(-1)!.content;
        const last = content.at(-1);
        if (last?.type == 'text') {
            last.content += str;
            last.end = this.scanner.position();
        } else content.push({
            type: 'text',
            start: this.scanner.position() - str.length,
            end: this.scanner.position(),
            content: str
        });
    }

    startBlock(block: BlockModifierNode) {
        this.addBlockNode(block);
        this.blockStack.push(block);
    }

    endBlock() {
        assert(this.blockStack.length >= 2);
        const node = this.blockStack.pop()!;
        node.end = this.scanner.position();
    }

    startInline(n: InlineModifierNode | ParagraphNode) {
        if (n.type == 'paragraph') this.addBlockNode(n);
        else this.addInlineNode(n);
        this.inlineStack.push(n);
    }

    endInline() {
        assert(this.inlineStack.length > 0);
        const node = this.inlineStack.pop()!;
        node.end = this.scanner.position();
    }
}

export enum ModifierFlags {
    Normal = 0,
    /** Content is preformatted: no escaping, no inner tags */
    Preformatted = 1,
    /** No content slot */
    Marker = 2
}

export class BlockModifier {
    constructor(
        public readonly name: string, 
        public readonly flags: ModifierFlags = ModifierFlags.Normal) {}
}

export class InlineModifier {
    constructor(
        public readonly name: string, 
        public readonly flags: ModifierFlags = ModifierFlags.Normal) {}
}

export interface Configuration {
    blockModifiers: Readonly<Map<string, BlockModifier>>,
    inlineModifiers: Readonly<Map<string, InlineModifier>>

    // TODO: shorthands
}

export class CustomConfiguration {
    private blocks = new Map<string, BlockModifier>;
    private inlines = new Map<string, InlineModifier>;
    
    constructor() {}

    get blockModifiers(): Readonly<Map<string, BlockModifier>> {
        return this.blocks;
    }

    get inlineModifiers(): Readonly<Map<string, InlineModifier>> {
        return this.inlines;
    }

    addBlock(...xs: BlockModifier[]) {
        for (const x of xs) {
            if (this.blocks.has(x.name))
                throw Error(`block modifier already exists: ${x.name}`);
            this.blocks.set(x.name, x);
        }
    }

    addInline(...xs: InlineModifier[]) {
        for (const x of xs) {
            if (this.inlines.has(x.name))
                throw Error(`block modifier already exists: ${x.name}`);
            this.inlines.set(x.name, x);
        }
    }
}