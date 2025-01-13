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

    // also accepts str itself, but the return value does not contain it
    // returns null if encountered EOF before str
    acceptUntil(str: string): string | null
}

export enum MessageSeverity {
    Info,
    Warning,
    Error
}

// Fixes are optional language-server features
export interface FixSuggestion {
    info(): string,
    apply(src: string, cursor: number): [out_src: string, new_cursor: number]
}

export interface Message {
    severity(): MessageSeverity,
    position(): number,
    length(): number,
    info(): string,
    fixes(): readonly FixSuggestion[]
}

export class Node {
    public attributes = new Map<string, string>();
    public content: (Node | string)[] = [];
    public end: number = -1;
    constructor(public name: string, public start: number) {}
}

export class Document {
    constructor(public root: Node, public messages: Message[]) {};

    debugDump(): string {
        function dumpNode(node: Node, prefix = '') {
            let attrs = [...node.attributes.entries()].map(([a, b]) => `${a}: ${b}`).join(', ');
            if (attrs.length > 0) attrs = ' ' + attrs;
            let result = `<${node.name}@${node.start}${attrs}`;
            if (node.content.length > 0) {
                result += '>'
                for (const x of node.content) {
                    if (typeof x == 'string') {
                        result += `\n${prefix}  ${x}`;
                    } else {
                        result += `\n${prefix}  ${dumpNode(x, prefix + '  ')}`;
                    }
                }
                result += `\n${prefix}</${node.name}@${node.end}>`;
            } else {
                result += '/>';
            }
            return result;
        }
        let root = dumpNode(this.root);
        let msgs = this.messages.map((x) => 
            `at ${x.position()}: ${MessageSeverity[x.severity()]}: ${x.info()}`).join('\n');
        return `${msgs}\n${root}`;
    }
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

export class Configuration {
    // TODO
    // Rules for actual modifiers and shorthand notations go here and are passed to Parser
}