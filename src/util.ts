import { Document, Message, MessageSeverity, Node, PositionRange } from "./interface";
import { ReferredMessage } from "./messages";

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

export function cloneNode(node: Node, referring?: PositionRange): Node {
    switch (node.type) {
        case "block":
        case "inline":
            return {
                type: node.type as any,
                start: node.start,
                end: node.end,
                mod: node.mod,
                head: structuredClone(node.head),
                arguments: structuredClone(node.arguments),
                content: node.content.map((x) => cloneNode(x, referring) as any),
                state: undefined,
                expansion: undefined
            };
        case "root":
        case "paragraph":
            return {
                type: node.type as any,
                start: node.start,
                end: node.end,
                content: node.content.map((x) => cloneNode(x) as any)
            }
        case "pre":
        case "text":
        case "escaped":
            return structuredClone(node);
        default:
            assert(false);
    }
}

export function cloneNodes(nodes: Node[]): Node[] {
    return nodes.map((x) => cloneNode(x));
}


export function stripDocument(doc: Document) {
    function stripNode(node: Node): Node[] {
        switch (node.type) {
            case "pre":
            case "text":
            case "escaped":
                return [node];
            case "block":
            case "inline":
                if (node.expansion !== undefined)
                    return node.expansion.flatMap((x) => stripNode(x));
            case "paragraph":
            case "root":
                node.content = node.content.flatMap((x) => stripNode(x)) as any;
                return [node];
            default:
                assert(false);
        }
    }
    doc.root = stripNode(doc.root)[0] as any;
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

    function dumpContent(content: Node[], prefix: string) {
        let dumps = content.map((x) => dumpNode(x, prefix + '  ')).filter((x) => x.length > 0);
        if (dumps.length == 0) return '';
        return dumps.map((x) => `\n${prefix}  ${x}`).join('');
    }

    function dumpNode(node: Node, prefix = '') {
        let result = `<${node.type}@${node.start}`;
        switch (node.type) {
        case "root":
        case "paragraph":
            const content = dumpContent(node.content, prefix);
            if (content.length > 0)
                result += `>${content}\n${prefix}</${node.type}@${node.end}>`;
            else result += `-${node.end} />`;
            break;
        case "escaped":
        case "pre":
            result += `>\n${prefix}  ${node.content}\n${prefix}</${node.type}@${node.end}>`;
            break;
        case "inline":
        case "block":
            const args = node.arguments.map((x, i) => `\n${prefix}    (${i})@${x.start}-${x.end}=${x.content}`).join('')
            if (node.content.length > 0) {
                result += ` id=${node.mod.name}${args}>` + dumpContent(node.content, prefix) + `\n${prefix}</${node.type}@${node.end}>`;
            } else result += `-${node.end} id=${node.mod.name}${args} />`;
            if (node.expansion) {
                const content = dumpContent(node.expansion, prefix);
                if (content.length > 0)
                    result += `\n${prefix}<expansion>${content}\n${prefix}</expansion>`;
                else
                    result += `\n${prefix}<expansion />`;
            }
            break;
        case "text":
            return node.content;
        }
        return result;
    }

    function dumpMsg(m: Message) {
        let result = `at ${pos2lc(m.position)}, len ${m.length}: ${MessageSeverity[m.severity]}[${m.code}]: ${m.info}`;
        while (m instanceof ReferredMessage) {
            m = m.original;
            result += `\n---> original at: ${pos2lc(m.position)}, len ${m.length}`
        }
        return result;
    }

    let root = dumpNode(doc.root);
    let msgs = doc.messages.map(dumpMsg).join('\n');
    return `${msgs}\n${root}`;
}