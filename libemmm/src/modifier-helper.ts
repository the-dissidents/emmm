import { ModifierNode, Message, BlockModifierNode, NodeType } from "./interface";
import { ArgumentCountMismatchMessage, CannotExpandArgumentMessage, MultipleBlocksNotPermittedMessage, OnlySimpleParagraphsPermittedMessage } from "./messages";

export function checkArgumentLength(node: ModifierNode, min?: number, max = min): Message[] | null {
    if ((min !== undefined && node.arguments.length < min)
     || (max !== undefined && node.arguments.length > max)) 
    {
        return [new ArgumentCountMismatchMessage({
            source: node.location.source,
            start: node.head.start, 
            end: node.head.end
        }, min, max)];
    }
    return null;
}

export function checkArguments(node: ModifierNode, min?: number, max = min): Message[] | null {
    const arg = node.arguments.find((x) => x.expansion === undefined);
    if (arg !== undefined) {
        // debugger;
        return [new CannotExpandArgumentMessage(arg.location)];
    }
    return checkArgumentLength(node, min, max);
}

export function onlyPermitSimpleParagraphs(node: BlockModifierNode<any>): Message[] | null {
    for (const ent of node.content) {
        if (ent.type !== NodeType.Paragraph) {
            return [new OnlySimpleParagraphsPermittedMessage(ent.location)];
        }
    }
    return null;
}

export function onlyPermitSingleBlock(node: BlockModifierNode<any>): Message[] | null {
    if (node.content.length > 1) {
        let last = node.content.at(-1)!.location;
        return [new MultipleBlocksNotPermittedMessage({
            source: node.location.source, 
            start: node.content[1].location.start, 
            end: last.actualEnd ?? last.end
        })];
    }
    return null;
}
