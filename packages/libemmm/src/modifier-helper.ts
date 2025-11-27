import { debug } from "./debug";
import { ModifierNode, Message, BlockModifierNode, NodeType, BlockEntity, SystemModifierNode, InlineEntity, ModifierSlotType, SystemModifierDefinition, ParagraphNode, ModifierArgument } from "./interface";
import { ArgumentCountMismatchMessage, CannotExpandArgumentMessage, ContentExpectedMessage, EntityNotAllowedMessage, MultipleBlocksNotPermittedMessage, OnlySimpleParagraphsPermittedMessage, OverwriteSpecialVariableMessage } from "./messages";
import { ParseContext } from "./parser-config";
import { cloneNode, stripNode } from "./util";

type BindResult<P extends string[], Opt extends string[], N extends Record<string, string>> = {
    msgs: Message[],
    args: undefined,
    nodes: undefined,
    rest: undefined,
    restNodes: undefined
} | {
    msgs: null,
    args: {[key in P[number]]: string} & {[key in Opt[number]]?: string | undefined} & {[key in keyof N]: string},
    nodes: {[key in P[number]]: ModifierArgument} & {[key in Opt[number]]: ModifierArgument | undefined} & {[key in keyof N]: ModifierArgument | undefined},
    rest: string[],
    restNodes: ModifierArgument[]
};

export function bindArgs<P extends string[], Opt extends string[] = [], N extends Record<string, string> = {}>(
    node: ModifierNode, p: readonly [...P], 
    opts?: { 
        named?: N, 
        optional?: readonly [...Opt], 
        rest?: boolean, 
        trim?: boolean
    }
): BindResult<P, Opt, N> {
    const badargs = node.arguments.positional.filter((x) => x.expansion === undefined);
    if (badargs.length > 0) return {
        msgs: badargs.map((x) => new CannotExpandArgumentMessage(x.location)),
        args: undefined,
        nodes: undefined,
        rest: undefined,
        restNodes: undefined
    };

    const maxLength = 
        opts?.rest ? Infinity : p.length + (opts?.optional?.length ?? 0);
    if (node.arguments.positional.length < p.length
     || node.arguments.positional.length > maxLength
    ) return {
        msgs: [new ArgumentCountMismatchMessage({
            source: node.location.source,
            start: node.head.start, 
            end: node.head.end
        }, p.length, maxLength)],
        args: undefined,
        nodes: undefined,
        rest: undefined,
        restNodes: undefined
    };

    const args: any = {};
    const nodes: any = {};
    p.forEach((name, i) => {
        nodes[name] = node.arguments.positional[i];
        args[name] = nodes[name].expansion!;
        if (opts?.trim) args[name] = args[name].trim();
    });

    if (opts?.optional) opts.optional.forEach((name, i) => {
        nodes[name] = node.arguments.positional[p.length + i];
        args[name] = nodes[name]?.expansion!;
        if (opts?.trim && args[name]) args[name] = args[name].trim();
    });

    if (opts?.named) Object.entries(opts.named).forEach(([name, def]) => {
        nodes[name] = node.arguments.named.get(name);
        args[name] = node.arguments.named.get(name) ?? def;
        if (opts?.trim) args[name] = args[name]?.trim();
    });

    const restNodes = node.arguments.positional
        .slice(p.length + (opts?.optional?.length ?? 0));

    const rest = restNodes
        .map((x) => opts?.trim ? x.expansion!.trim() : x.expansion!);

    return { msgs: null, args, nodes, rest, restNodes };
}

/**
 * Helper function to ensure that a modifier only accepts plaintext paragraphs as content.
 * @returns The content as a string if OK, otherwise an array of error messages.
 */
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

    function checkContent(ents: BlockEntity[]) {
        if (ents.length == 0) return '';
        else if (ents.length > 1) {
            let last = ents.at(-1)!.location;
            return [new MultipleBlocksNotPermittedMessage({
                source: last.source, 
                start: ents[1].location.start, 
                end: last.actualEnd ?? last.end
            })];
        } 
        return check(ents[0]);
    }

    function check(ent: BlockEntity): Message[] | string {
        if (ent.type == NodeType.BlockModifier) {
            if (!ent.expansion) return [new EntityNotAllowedMessage(
                ent.location, 'it does not expand to plain text')];
            return checkContent(ent.expansion);
        } else if (ent.type == NodeType.Preformatted) {
            return ent.content.text;
        } else if (ent.type !== NodeType.Paragraph) {
            return [new OnlySimpleParagraphsPermittedMessage(ent.location)];
        }
        return checkInline(ent.content);
    }
    
    return checkContent(node.content);
}

/**
 * Helper function to ensure that a modifier does not accept any block modifiers inside its content.
 * @returns `null` if OK, otherwise an array of error messages.
 */
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
    return check(node.expansion ?? node.content);
}

/**
 * Helper function to ensure that a modifier only accepts one block as its content.
 * @returns `null` if OK, otherwise an array of error messages.
 */
export function onlyPermitSingleBlock(
    node: BlockModifierNode<any> | SystemModifierNode<any>,
    opt?: { optional?: boolean }
): Message[] | null {
    function check(nodes: BlockEntity[]): Message[] | null {
        if (nodes.length > 1) {
            const last = nodes.at(-1)!.location;
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
        } else if (nodes.length == 0 && !opt?.optional) {
            return [new ContentExpectedMessage(node.location)];
        }
        return null;
    }
    return check(node.expansion ?? node.content);
}

export function createPlaintextWrapper(name: string,
        get: (cxt: ParseContext) => string | undefined,
        set: (cxt: ParseContext, value: string) => string,
        slotType = ModifierSlotType.Normal) {
    return new SystemModifierDefinition<void>(name, slotType, {
        delayContentExpansion: true,
        afterProcessExpansion(node, cxt) {
            let { msgs } = bindArgs(node, []);
            if (msgs) return msgs;
            const result = onlyPermitPlaintextParagraph(node);
            if (typeof result !== 'string') return result;

            const previous = get(cxt);
            if (previous !== undefined)
                msgs = [new OverwriteSpecialVariableMessage(node.head, name, previous)];
            set(cxt, result);
            return msgs ?? [];
        },
    });
}

export function createParagraphWrapper(name: string,
        get: (cxt: ParseContext) => ParagraphNode | undefined,
        set: (cxt: ParseContext, value: ParagraphNode) => void,
        slotType = ModifierSlotType.Normal) {
    return new SystemModifierDefinition<void>(name, slotType, {
        afterProcessExpansion(node, cxt) {
            let { msgs } = bindArgs(node, []);
            if (msgs) return msgs;
            msgs = onlyPermitSingleBlock(node);
            if (msgs) return msgs;
            msgs = onlyPermitSimpleParagraphs(node);
            if (msgs) return msgs;

            const previous = get(cxt);
            if (previous !== undefined)
                msgs = [new OverwriteSpecialVariableMessage(node.head, name, "<block>")];
            const content = cloneNode(node.content[0]);
            const stripped = stripNode(content)[0] as ParagraphNode;
            set(cxt, stripped);
            return msgs ?? [];
        },
    });
}