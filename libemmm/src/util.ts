import { debug } from "./debug";
import { Document, Message, MessageSeverity, DocumentNode, PositionRange, ArgumentEntity, ModifierArgument, NodeType } from "./interface";
import { ReferredMessage } from "./messages";


// TODO: use a prefix tree to find names?
export class NameManager<T extends {name: string}> {
    private array: {k: string, v: T}[] = [];
    private data = new Map<string, T>();
    
    constructor(from?: ReadonlyNameManager<T> | readonly T[]) {
        if (from === undefined) return;
        if (from instanceof NameManager) {
            this.array = [...from.array];
            this.data = new Map(from.data);
        } else {
            assert(Array.isArray(from));
            this.array = from.map((x) => ({k: x.name, v: x}));
            this.array.sort((a, b) => b.k.length - a.k.length);
            this.data = new Map(from.map((x) => [x.name, x]));
        }
    }

    toArray(): readonly T[] {
        return this.array.map(({v}) => v);
    }

    get(name: string) {
        return this.data.get(name);
    }

    has(name: string) {
        return this.data.has(name);
    }

    remove(name: string) {
        let i = this.data.get(name);
        assert(i !== undefined);
        this.data.delete(name);
        this.array.splice(this.array.findIndex((x) => x.k == name), 1);
    }

    add(...elems: T[]) {
        for (const elem of elems) {
            assert(!this.has(elem.name));
            this.data.set(elem.name, elem);
            const len = elem.name.length;
            let i = 0;
            while (i < this.array.length && this.array[i].k.length > len) i++;
            this.array.splice(i, 0, {k: elem.name, v: elem});
        }
    }

    find(predicate: (x: T) => boolean): T | undefined {
        const result = this.array.find((x) => predicate(x.v));
        return result ? result.v : undefined;
    }
}

export type ReadonlyNameManager<T extends {name: string}> = Omit<NameManager<T>, 'add' | 'remove'>;

export function assert(x: boolean): asserts x {
    if (!!!x) {
        let error = new Error('assertion failed');
        console.log(error.stack);
        throw error; 
    }
}

export function has(v: number, f: number): boolean {
    return (v & f) === f;
}

export function linePositions(src: string): number[] {
    let result = [0];
    [...src].forEach((x, i) => {
        if (x == '\n') result.push(i+1);
    });
    result.push(Infinity);
    return result;
}

const cloneArgument = (arg: ModifierArgument): ModifierArgument => ({
    start: arg.start, end: arg.end,
    content: arg.content.map((ent) => {
        switch (ent.type) {
            case NodeType.Text:
            case NodeType.Escaped:
                return structuredClone(ent);
            case NodeType.Interpolation:
                return {
                    type: ent.type,
                    start: ent.start,
                    end: ent.end,
                    definition: ent.definition,
                    argument: cloneArgument(ent.argument),
                    expansion: ent.expansion
                };
            default:
                return debug.never(ent);
        }
    })
});


export function cloneNode(node: DocumentNode, referring?: PositionRange): DocumentNode {
    switch (node.type) {
        case NodeType.BlockModifier:
        case NodeType.InlineModifier:
        case NodeType.SystemModifier:
            return {
                start: node.start,
                end: node.end,
                type: node.type as any,
                mod: node.mod,
                state: undefined,
                head: structuredClone(node.head),
                arguments: node.arguments.map(cloneArgument),
                content: node.content.map((x) => cloneNode(x, referring) as any),
                expansion: node.expansion ? cloneNodes(node.expansion) as any : undefined
            };
        case NodeType.Root:
        case NodeType.Paragraph:
            return {
                type: node.type as any,
                start: node.start,
                end: node.end,
                content: node.content.map((x) => cloneNode(x) as any)
            }
        case NodeType.Preformatted:
        case NodeType.Text:
        case NodeType.Escaped:
            return structuredClone(node);
        default:
            return debug.never(node);
    }
}

export function cloneNodes(nodes: DocumentNode[]): DocumentNode[] {
    return nodes.map((x) => cloneNode(x));
}

export function stripDocument(doc: Document) {
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
    doc.root = stripNode(doc.root)[0] as any;
}

function debugPrintArgEntity(node: ArgumentEntity): string {
    switch (node.type) {
        case NodeType.Text:
            return node.content;
        case NodeType.Escaped:
            return `<Escaped:${node.content}>`;
        case NodeType.Interpolation:
            return `<Interp:${node.definition.name}-${node.definition.postfix}:${debugPrintArgument(node.argument)}${node.expansion ? `=${node.expansion}` : ''}>`;
        default:
            return debug.never(node);
    }
}

export function debugPrintArgument(arg: ModifierArgument): string {
    return arg.content.map(debugPrintArgEntity).join('');
}

export function debugPrintNode(node: DocumentNode, prefix = '') {
    let result = `<${NodeType[node.type]}@${node.start}`;
    switch (node.type) {
        case NodeType.Root:
        case NodeType.Paragraph:
            const content = debugPrintNodes(node.content, prefix);
            if (content.length > 0)
                result += `>\n${content}\n${prefix}</${NodeType[node.type]}@${node.end}>`;
            else result += `-${node.end} />`;
            break;
        case NodeType.Escaped:
        case NodeType.Preformatted:
            result += `>\n${prefix}  ${node.content}\n${prefix}</${NodeType[node.type]}@${node.end}>`;
            break;
        case NodeType.InlineModifier:
        case NodeType.BlockModifier:
        case NodeType.SystemModifier:
            const args = node.arguments.map((x, i) => `\n${prefix}    (${i})@${x.start}-${x.end}=${debugPrintArgument(x)}`).join('')
            if (node.content.length > 0) {
                result += ` id=${node.mod.name}${args}>\n` + debugPrintNodes(node.content, prefix) + `\n${prefix}</${NodeType[node.type]}@${node.end}>`;
            } else result += `-${node.end} id=${node.mod.name}${args} />`;
            if (node.expansion) {
                const content = debugPrintNodes(node.expansion, prefix);
                if (content.length > 0)
                    result += `\n${prefix}<expansion>\n${content}\n${prefix}</expansion>`;
                else if (node.type != NodeType.SystemModifier)
                    result += `\n${prefix}<expansion />`;
            }
            break;
        case NodeType.Text:
            return node.content;
        default:
            return debug.never(node);
    }
    return result;
}

export function debugPrintNodes(content: DocumentNode[], prefix: string = '') {
    let dumps = content.map((x) => debugPrintNode(x, prefix + '  ')).filter((x) => x.length > 0);
    if (dumps.length == 0) return '';
    return dumps.map((x) => `${prefix}  ${x}`).join('\n');
}

export function debugDumpDocument(doc: Document, source: string): string {
    const lines = linePositions(source);

    function pos2lc(pos: number) {
        let line = -1, linepos = 0;
        for (let i = 1; i < lines.length; i++) {
            if (lines[i] > pos) {
                line = i;
                linepos = lines[i-1];
                break;
            }
        }
        return `l${line}c${pos - linepos + 1}`;
    }

    function dumpMsg(m: Message) {
        let result = `at ${pos2lc(m.position)}, len ${m.length}: ${MessageSeverity[m.severity]}[${m.code}]: ${m.info}`;
        while (m instanceof ReferredMessage) {
            m = m.original;
            result += `\n---> original at: ${pos2lc(m.position)}, len ${m.length}`
        }
        return result;
    }

    let root = debugPrintNode(doc.root);
    let msgs = doc.messages.map(dumpMsg).join('\n');
    if (msgs.length > 0) msgs += '\n';
    return `${msgs}${root}`;
}