// The scanner of any implementation should be capable of handling UTF-8 
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

export class Node {
    public attributes = new Map<string, string>();
    public content: (Node | string)[] = [];
    public end: number = -1;
    constructor(public name: string, public start: number) {}
}

export class Document {
    constructor(
        public root: Node, 
        public messages: Message[]) {};
}

export class EmitEnvironment {
    private document = new Node('document', 0);
    private messages: Message[] = [];
    private stack: Node[] = [this.document];
    constructor(private scanner: Scanner) {}

    get tree(): Document {
        return new Document(this.document, this.messages);
    }

    message(m: Message) {
        this.messages.push(m);
    }

    addNode(n: Node): Node {
        this.stack.at(-1)!.content.push(n);
        return n;
    }

    addString(str: string) {
        let content = this.stack.at(-1)!.content;
        if (typeof(content.at(-1)) == 'string') {
            content[content.length-1] += str;
        } else {
            content.push(str);
        }
    }

    newNode(name: string): Node {
        let node = new Node(name, this.scanner.position());
        this.addNode(node);
        return node;
    }

    startNode(name: string): Node {
        let node = this.newNode(name);
        this.stack.push(node);
        return node;
    }

    endNode(name: string): Node {
        let node = this.stack.at(-1)!;
        if (node.name != name)
            throw new Error(`name mismatch: got ${name}, expecting ${node.name}`);
        node.end = this.scanner.position();
        return this.stack.pop()!;
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