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
        let result = `<${node.type}@${node.start}`;
        switch (node.type) {
        case "root":
        case "paragraph":
            result += '>' + node.content.map((x) => `\n${prefix}  ` + dumpNode(x, prefix + '  ')).join('') + `\n${prefix}</${node.type}@${node.end}>`;
            break;
        case "escaped":
        case "pre":
            result += `>\n${prefix}  ${node.content}\n${prefix}</${node.type}@${node.end}>`;
            break;
        case "inline":
        case "block":
            const args = node.arguments.map((x, i) => `\n${prefix}    (${i})@${x.start}-${x.end}=${x.content}`).join('')
            result += ` id=${node.id}${args}>` + node.content.map((x) => `\n${prefix}  ` + dumpNode(x, prefix + '  ')).join('') + `\n${prefix}</${node.type}@${node.end}>`;
            break;
        case "text":
            return node.content;
        }
        return result;
    }
    let root = dumpNode(doc.root);
    let msgs = doc.messages.map((x) => 
        `at ${pos2lc(x.position)}: ${MessageSeverity[x.severity]}: ${x.info}`).join('\n');
    return `${msgs}\n${root}`;
}

let text2 = String.raw`
[.var name:foobar]
[.var version:0.1.0]

Version [/$version], created by [/$name]`;

let t0 = performance.now()
let doc = new Parser(new SimpleScanner(text2), DefaultConfiguration).parse();
console.log(performance.now() - t0);
console.log(debugDump(doc, text2))