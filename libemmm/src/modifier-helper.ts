import { debug } from "./debug";
import { ModifierNode, Message, BlockModifierNode, NodeType, BlockEntity, SystemModifierNode, InlineEntity } from "./interface";
import { ArgumentCountMismatchMessage, CannotExpandArgumentMessage, EntityNotAllowedMessage, MultipleBlocksNotPermittedMessage, OnlySimpleParagraphsPermittedMessage } from "./messages";

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

export function onlyPermitPlaintextParagraph(
    node: BlockModifierNode<any> | SystemModifierNode<any>): Message[] | string
{
    function checkInline(ents: InlineEntity[]): Message[] | string {
        let result = '';
        for (const ent of ents) {
            switch (ent.type) {
                case NodeType.Text:
                case NodeType.Escaped:
                    result += ent.content;
                    break;
                case NodeType.SystemModifier:
                    break;
                case NodeType.InlineModifier:
                    if (!ent.expansion) return [new EntityNotAllowedMessage(
                        ent.location, 'it does not expand to plain text')];
                    let checkInner = checkInline(ent.expansion);
                    if (Array.isArray(checkInner)) return checkInner;
                    result += checkInner;
                    break;
                default:
                    return debug.never(ent);
            }
        }
        return result;
    }

    function check(ent: BlockEntity): Message[] | string {
        if (ent.type == NodeType.BlockModifier) {
            if (!ent.expansion) return [new EntityNotAllowedMessage(
                ent.location, 'it does not expand to plain text')];
            if (ent.expansion.length == 0) return '';
            else if (ent.expansion.length > 1) {
                let last = ent.expansion.at(-1)!.location;
                return [new MultipleBlocksNotPermittedMessage({
                    source: last.source, 
                    start: ent.expansion[1].location.start, 
                    end: last.actualEnd ?? last.end
                })];
            } 
            return check(ent.expansion[0]);
        } else if (ent.type !== NodeType.Paragraph) {
            return [new OnlySimpleParagraphsPermittedMessage(ent.location)];
        }
        return checkInline(ent.content);
    }
    
    return check(node);
}

export function onlyPermitSimpleParagraphs(
    node: BlockModifierNode<any> | SystemModifierNode<any>): Message[] | null 
{
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

export function onlyPermitSingleBlock(
    node: BlockModifierNode<any> | SystemModifierNode<any>): Message[] | null 
{
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
