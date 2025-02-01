import { debug } from "./debug";
import { ArgumentEntity, NodeType, ModifierArgument, DocumentNode, Document, Message, MessageSeverity, BlockModifierDefinition, BlockShorthand, InlineModifierDefinition, InlineShorthand, ModifierFlags } from "./interface";
import { ReferredMessage } from "./messages";
import { has, linePositions } from "./util";

export const debugPrint = {
    blockModifier: (x: BlockModifierDefinition<any>) => 
        `[.${x.name}] (${ModifierFlags[x.flags]})`,
    
    inlineModifier: (x: InlineModifierDefinition<any>) => 
        `[/${x.name}] (${ModifierFlags[x.flags]})`,
    
    inlineShorthand: (x: InlineShorthand<any>) =>
        x.name + x.parts.map((x, i) => ` .. <arg${i}> .. ${x}`).join('') 
               + (has(x.mod.flags, ModifierFlags.Marker)
                    ? '' : ` .. <slot> .. ${x.postfix ?? '<no postfix>'}`),

    blockShorthand: (x: BlockShorthand<any>) =>
        x.name + x.parts.map((x, i) => ` .. <arg${i}> .. ${x}`).join('') 
               + (has(x.mod.flags, ModifierFlags.Marker)
                    ? '' : ` .. <slot> .. ${x.postfix ?? '<no postfix>'}`),
    
    argument: (arg: ModifierArgument) => 
        arg.content.map(debugPrintArgEntity).join(''),

    node: (...nodes: DocumentNode[]) => nodes.map((x) => debugPrintNode(x)).join('\n'),

    document: debugDumpDocument
}

function debugPrintArgEntity(node: ArgumentEntity): string {
    switch (node.type) {
        case NodeType.Text:
            return node.content;
        case NodeType.Escaped:
            return `<Escaped:${node.content}>`;
        case NodeType.Interpolation:
            return `<Interp:${node.definition.name}-${node.definition.postfix}:${debugPrint.argument(node.argument)}${node.expansion ? `=${node.expansion}` : ''}>`;
        default:
            return debug.never(node);
    }
}

function debugPrintNode(node: DocumentNode, prefix = '') {
    function debugPrintNodes(content: DocumentNode[], prefix: string = '') {
        let dumps = content.map((x) => debugPrintNode(x, prefix + '  ')).filter((x) => x.length > 0);
        if (dumps.length == 0) return '';
        return dumps.map((x) => `${prefix}  ${x}`).join('\n');
    }
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
            const args = node.arguments.map((x, i) => `\n${prefix}    (${i})@${x.start}-${x.end}=${debugPrint.argument(x)}`).join('');
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

function debugDumpDocument(doc: Document, source: string): string {
    const lines = linePositions(source);

    function pos2lc(pos: number) {
        let line = -1, linepos = 0;
        for (let i = 1; i < lines.length; i++) {
            if (lines[i] > pos) {
                line = i;
                linepos = lines[i - 1];
                break;
            }
        }
        return `l${line}c${pos - linepos + 1}`;
    }

    function dumpMsg(m: Message) {
        let result = `at ${pos2lc(m.start)}-${pos2lc(m.end)}: ${MessageSeverity[m.severity]}[${m.code}]: ${m.info}`;
        while (m instanceof ReferredMessage) {
            m = m.original;
            result += `\n---> original at: ${pos2lc(m.start)}-${pos2lc(m.end)}`;
        }
        return result;
    }

    let root = debugPrintNode(doc.root);
    let msgs = doc.messages.map(dumpMsg).join('\n');
    if (msgs.length > 0) msgs += '\n';
    return `${msgs}${root}`;
}
