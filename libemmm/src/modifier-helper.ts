import { ModifierNode, Message, BlockModifierNode, NodeType, BlockEntity } from "./interface";
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
    function check(nodes: BlockEntity[]): Message[] | null {
        for (let ent of nodes) {
            if (ent.type == NodeType.BlockModifier && ent.expansion !== undefined) {
                const cs = check(ent.expansion);
                if (cs) return cs;
            } else if (ent.type !== NodeType.Paragraph) {
                return [new OnlySimpleParagraphsPermittedMessage(ent.location)];
            }
        }
        return null;
    }
    return check(node.content);
}

export function onlyPermitSingleBlock(node: BlockModifierNode<any>): Message[] | null {
    function check(nodes: BlockEntity[]): Message[] | null {
        if (nodes.length > 1) {
            let last = nodes.at(-1)!.location;
            return [new MultipleBlocksNotPermittedMessage({
                source: last.source, 
                start: nodes[1].location.start, 
                end: last.actualEnd ?? last.end
            })];
        } else if (nodes.length == 1 
                && nodes[0].type === NodeType.BlockModifier 
                && nodes[0].expansion !== undefined)
        {
            return check(nodes[0].expansion);
        }
        return null;
    }
    return check(node.content);
}
