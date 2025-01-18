import { SimpleScanner } from "./front";
import * as Parser from "./parser";
import { Node, Document, MessageSeverity, Message } from "./interface";
import { DefaultConfiguration } from "./default";
import { linePositions } from "./util";
import { ReferredMessage } from "./messages";

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

    function dumpContent(content: Node[], prefix: string) {
        return content.map((x) => `\n${prefix}  ` + dumpNode(x, prefix + '  ')).join('');
    }

    function dumpNode(node: Node, prefix = '') {
        let result = `<${node.type}@${node.start}`;
        switch (node.type) {
        case "root":
        case "paragraph":
            if (node.content.length > 0)
                result += '>' + dumpContent(node.content, prefix) + `\n${prefix}</${node.type}@${node.end}>`;
            else result += `-${node.end} />`;
            break;
        case "escaped":
        case "pre":
            result += `>\n${prefix}  ${node.content}\n${prefix}</${node.type}@${node.end}>`;
            break;
        case "inline":
        case "block":
            const args = node.arguments.map((x, i) => `\n${prefix}    (${i})@${x.start}-${x.end}=${x.content}`).join('')
            if (node.content.length > 0)
                result += ` id=${node.mod.name}${args}>` + dumpContent(node.content, prefix) + `\n${prefix}</${node.type}@${node.end}>`;
            else result += `-${node.end} id=${node.mod.name}${args} />`;
            if (node.expansion?.length ?? 0 > 0)
                result += `\n${prefix}<expansion>` + dumpContent(node.expansion!, prefix) + `\n${prefix}</expansion>`;
            else if (node.expansion !== undefined)
                result += `\n${prefix}<expansion />`;
            break;
        case "text":
            return node.content;
        }
        return result;
    }

    function dumpMsg(m: Message) {
        let result = `at ${pos2lc(m.position)}, len ${m.length}: ${MessageSeverity[m.severity]}: ${m.info}`;
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

let text2 = String.raw`
[.var name:foobar]
[.var version:0.1.0]

Version [/$version], created by [/$name]`;

text2 = String.raw`
[.define-block myblock]
:--
Hello block! x is now 1.
[.var x:1]
--:

Checking x: [/$x]
[.myblock;]
Checking x: [/$x]`;

text2 = `
[.define-block bad]
abc[/$nonexistent]

[.define-block bad2]
[.bad;]

[.bad2;]`

let t0 = performance.now()
let doc = Parser.parse(new SimpleScanner(text2), DefaultConfiguration);
console.log(performance.now() - t0);
console.log(debugDump(doc, text2))