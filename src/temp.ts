import { SimpleScanner } from "./front";
import { Parser } from "./parser";
import { Node, Document, MessageSeverity } from "./interface";
import { DefaultConfiguration } from "./default";
import { linePositions } from "./util";

function debugDump(doc: Document, source: string): string {
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

    function dumpNode(node: Node, prefix = '') {
        let attrs = [...node.attributes.entries()].map(([a, b]) => `${a}=${b}`).join(', ');
        if (attrs.length > 0) attrs = ' ' + attrs;
        let result = `<${node.name}@${pos2lc(node.start)}${attrs}`;
        if (node.content.length > 0) {
            result += '>'
            for (const x of node.content) {
                if (typeof x == 'string') {
                    result += `\n${prefix}  ${x}`;
                } else {
                    result += `\n${prefix}  ${dumpNode(x, prefix + '  ')}`;
                }
            }
            result += `\n${prefix}</${node.name}@${pos2lc(node.end)}>`;
        } else {
            result += '/>';
        }
        return result;
    }
    let root = dumpNode(doc.root);
    let msgs = doc.messages.map((x) => 
        `at ${pos2lc(x.position)}: ${MessageSeverity[x.severity]}: ${x.info}`).join('\n');
    return `${msgs}\n${root}`;
}

let text2 = `[.quote]

aaa`;

let doc = new Parser(new SimpleScanner(text2), DefaultConfiguration).parse();
console.log(debugDump(doc, text2))