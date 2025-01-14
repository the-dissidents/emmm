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

let text = String.raw`
罗素理论中的假命题：

[.eq] \exists x(Kx \& \forall y(Ky \rightarrow y=x) \& Bx)
\tag{4.5}

不存在一个秃头的当今的法国国王。

[.quote] 一段引文
[.quote] 分开的一段引文

[.quote]
:--
在一起的

两段引文

[.quote] 外加镶嵌的一段
[.quote] :--
还有继续镶嵌的

最后两段。
--:
--:
`

let text2 = String.raw`
[.quote]
This is a styled block, and [/emphasis]this is some [/underline]styled[;] text[;] with nesting. This is an inline equation: [/eq](\geq) \cdot <\Phi(\alpha), V_{min}^C>[;] with normal text after it. Escaped: \[/eq].
`;

let doc = new Parser(new SimpleScanner(text2), DefaultConfiguration).parse();
console.log(debugDump(doc, text2))