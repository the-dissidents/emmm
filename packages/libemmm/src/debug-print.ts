import { debug } from "./debug";
import { ArgumentEntity, NodeType, ModifierArgument, Message, MessageSeverity, BlockEntity, InlineEntity, LocationRange } from "./interface";
import { BlockShorthand, InlineShorthand } from "./parser-config";
import { BlockModifierDefinition, InlineModifierDefinition, ModifierSlotType } from "./modifier";
import { Document } from "./parser-config";

export const debugPrint = {
    blockModifier: (x: BlockModifierDefinition<any>) =>
        `[.${x.name}] (${ModifierSlotType[x.slotType]})`,

    inlineModifier: (x: InlineModifierDefinition<any>) =>
        `[/${x.name}] (${ModifierSlotType[x.slotType]})`,

    inlineShorthand: (x: InlineShorthand<any>) =>
        x.name + x.parts.map((x, i) => ` .. <arg${i}> .. ${x}`).join('')
               + (x.mod.slotType == ModifierSlotType.None
                    ? '' : ` .. <slot> .. ${x.postfix ?? '<no postfix>'}`),

    blockShorthand: (x: BlockShorthand<any>) =>
        x.name + x.parts.map((x, i) => ` .. <arg${i}> .. ${x}`).join('')
               + (x.mod.slotType == ModifierSlotType.None
                    ? '' : ` .. <slot> .. ${x.postfix ?? '<no postfix>'}`),

    argument: (arg: ModifierArgument) =>
        arg.content.map(debugPrintArgEntity).join(''),

    node: (...nodes: (BlockEntity | InlineEntity)[]) =>
        nodes.map((x) => debugPrintNode(x)).join('\n'),

    message: debugPrintMsg,
    range: debugPrintRange,
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

function debugPrintNode(node: BlockEntity | InlineEntity, prefix = '') {
    function debugPrintNodes(content: (BlockEntity | InlineEntity)[], prefix: string = '') {
        let dumps = content.map((x) => debugPrintNode(x, prefix + '  ')).filter((x) => x.length > 0);
        if (dumps.length == 0) return '';
        return dumps.map((x) => `${prefix}  ${x}`).join('\n');
    }
    let result = `<${NodeType[node.type]}@${node.location.start}`;
    switch (node.type) {
        case NodeType.Paragraph:
            const content = debugPrintNodes(node.content, prefix);
            if (content.length > 0)
                result += `>\n${content}\n${prefix}</${NodeType[node.type]}@${node.location.end}>`;
            else result += `-${node.location.end} />`;
            break;
        case NodeType.Escaped:
            result += `>\n${prefix}  ${node.content}\n${prefix}</${NodeType[node.type]}@${node.location.end}>`;
            break;
        case NodeType.Preformatted:
            result += `>\n${prefix}  ${node.content.text}\n${prefix}</${NodeType[node.type]}@${node.location.end}>`;
            break;
        case NodeType.InlineModifier:
        case NodeType.BlockModifier:
        case NodeType.SystemModifier:
            const posargs = node.arguments.positional.map((x, i) =>
                `\n${prefix}    (${i})@${x.location.start}-${x.location.end}=${debugPrint.argument(x)}`).join('');
            const namedargs = [...node.arguments.named].map(([name, x], i) =>
                `\n${prefix}    <${name}>@${x.location.start}-${x.location.end}=${debugPrint.argument(x)}`).join('');
            if (node.content.length > 0) {
                result += ` id=${node.mod.name}${posargs}${namedargs}>\n` + debugPrintNodes(node.content, prefix) + `\n${prefix}</${NodeType[node.type]}@${node.location.end}>`;
            } else result += `-${node.location.end} id=${node.mod.name}${posargs}${namedargs} />`;
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

function debugPrintRange(loc: LocationRange, context = 1) {
    const isSingleCharacter = loc.start == loc.end;
    let [sr, sc] = loc.source.getRowCol(loc.start);
    let [er, ec] = loc.source.getRowCol(loc.actualEnd ?? loc.end);
    const rowWidth = Math.max((sr+1).toString().length, (er+1).toString().length);

    const startLine = Math.max(0, sr - context);
    const endLine = Math.min(loc.source.nLines - 1, er + context);
    let lines: string[] = [];
    for (let i = startLine; i <= endLine; i++) {
        const line = loc.source.getRow(i)!;
        lines.push((i+1).toString().padStart(rowWidth) + ' | ' + line);
        if (i >= sr && i <= er) {
            const startPos = i == sr ? sc : 0;
            const endPos = i == er ? ec : line.length;
            lines.push(
                  ' '.repeat(rowWidth) + ' | '
                + ' '.repeat(startPos)
                + (isSingleCharacter ? '^' : '~'.repeat(endPos - startPos + 1)));
        }
    }
    return lines.join('\n');
}

function debugPrintMsg(m: Message) {
    const poss = (loc: LocationRange) => {
        const [r1, c1] = loc.source.getRowCol(loc.start);
        if (loc.start == loc.end) return `l${r1+1}c${c1+1}`;
        const [r2, c2] = loc.source.getRowCol(loc.end);
        return `l${r1+1}c${c1+1}-l${r2+1}c${c2+1}`;
    }
    let loc: LocationRange | undefined = m.location;
    let result = `at ${poss(loc)}: ${MessageSeverity[m.severity]}[${m.code}]: ${m.info}`;
    while (loc = loc.original) {
        let d = loc.source !== m.location.source ? `(in ${loc.source.name}) ` : '';
        result += `\n---> original at: ${d}${poss(loc)}`;
    }
    return result;
}

function debugDumpDocument(doc: Document): string {
    let root = debugPrint.node(...doc.root.content);
    let msgs = doc.messages.map((x) =>
        debugPrintRange(x.location) + '\n' + debugPrintMsg(x)).join('\n');
    if (msgs.length > 0) msgs += '\n';
    return `Document: ${doc.root.source.name}\n${msgs}${root}`;
}
