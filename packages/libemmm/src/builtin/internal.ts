import { debug } from "../debug";
import { debugPrint } from "../debug-print";
import { BlockEntity, InlineEntity, Message, SystemModifierNode, ModifierNode, NodeType } from "../interface";
import { BlockModifierDefinition, InlineModifierDefinition, ModifierSlotType } from "../modifier";
import { EntityNotAllowedMessage } from "../messages";
import { bindArgs } from "../modifier-helper";
import { ParseContext } from "../parser-config";
import { _Ent, _Def } from "../typing-helper";
import { cloneNodes } from "../node-util";

export type CustomModifierSignature = {
    readonly slotName: string | undefined;
    readonly args: readonly string[];
    readonly namedArgs: Record<string, string>;
    preformatted: boolean | undefined;
}

export type BlockInstantiationData = {
    readonly slotName: string | undefined;
    readonly mod: BlockModifierDefinition<any>;
    readonly slotContent: readonly BlockEntity[];
    readonly args: ReadonlyMap<string, string>;
}

export type InlineInstantiationData = {
    readonly slotName: string | undefined;
    readonly mod: InlineModifierDefinition<any>;
    readonly slotContent: readonly InlineEntity[];
    readonly args: ReadonlyMap<string, string>;
}

export const builtins = Symbol();

declare module '../parser-config' {
    export interface ParseContextStoreDefinitions {
        [builtins]?: {
            blockSlotDelayedStack: CustomModifierSignature[];
            inlineSlotDelayedStack: CustomModifierSignature[];
            blockInstantiationData: BlockInstantiationData[];
            inlineInstantiationData: InlineInstantiationData[];
            insideModule: string | undefined;
        };
    }
}

export function initParseContext(cxt: ParseContext) {
    cxt.init(builtins, {
        blockSlotDelayedStack: [],
        inlineSlotDelayedStack: [],
        blockInstantiationData: [],
        inlineInstantiationData: [],
        insideModule: undefined
    });
}

export function customModifier<T extends NodeType.InlineModifier | NodeType.BlockModifier>(
    type: T, name: string, signature: CustomModifierSignature, content: _Ent<T>[])
{
    debug.info(`created custom ${NodeType[type]}:`, name);
    debug.info('args:', signature.args, 'named:', signature.namedArgs, `with ${signature.slotName === undefined ? 'no slot' : signature.slotName == '' ? 'empty slot name' : 'slot name: ' + signature.slotName}`);
    debug.trace(() => 'content is\n' + debugPrint.node(...content));

    type State = {
        ok: boolean,
        args: Map<string, string>
    };

    const flag =
        signature.slotName === undefined ? ModifierSlotType.None :
        signature.preformatted ? ModifierSlotType.Preformatted
        : ModifierSlotType.Normal;
    const mod = (type == NodeType.BlockModifier
        ? new BlockModifierDefinition<State>(name, flag)
        : new InlineModifierDefinition<State>(name, flag)
    ) as _Def<T, State>;
    const isInline = type == NodeType.InlineModifier;

    if (content.length == 1 && (
           content[0].type == NodeType.BlockModifier
        || content[0].type == NodeType.InlineModifier))
        mod.roleHint = content[0].mod.roleHint;

    mod.delayContentExpansion = true;
    mod.prepareExpand = (node: ModifierNode<State>) => {
        let { msgs, args } = bindArgs(node, signature.args, { named: signature.namedArgs });
        if (msgs) return msgs;
        node.state = {
            ok: true,
            args: new Map(Object.entries(args!))
        } satisfies State;
        return [];
    };
    mod.expand = (node: ModifierNode<State>) => {
        if (!node.state?.ok) return [];
        const contentClone = cloneNodes(content, {newLocation: node.location}) as any[];
        return contentClone;
    };
    mod.beforeProcessExpansion = (node: ModifierNode<State>, cxt: ParseContext) => {
        if (!node.state?.ok) return [];
        const store = cxt.get(builtins)!;
        const data = isInline ? store.inlineInstantiationData : store.blockInstantiationData;
        data.push({
            slotName: signature.slotName,
            mod: mod as any, args: node.state.args,
            slotContent: node.content as any
        });
        debug.trace(`pushed ${NodeType[type]} slot data for`, name);
        debug.trace(`... slotName:`,
            signature.slotName === '' ? '<unnamed>'
            : signature.slotName === undefined ? '<no slot>'
            : `'${signature.slotName}'`);
        debug.trace(`... args:`, '{' + [...node.state.args].map(([a, b]) => `${a} => ${b}`).join(', ') + '}');
        return [];
    };
    mod.afterProcessExpansion = (node: ModifierNode<State>, cxt: ParseContext) => {
        if (!node.state?.ok) return [];
        const store = cxt.get(builtins)!;
        const data = isInline ? store.inlineInstantiationData : store.blockInstantiationData;
        data.pop();
        debug.trace(`popped ${NodeType[type]} slot data for`, name);
        return [];
    };
    return mod;
}

export function makeInlineDefinition(content: BlockEntity[], msgs: Message[]) {
    let lastIsParagraph = false;
    let concat: InlineEntity[] = [];
    for (const n of content) {
        switch (n.type) {
            case NodeType.Group:
                concat.push(...makeInlineDefinition(n.content, msgs));
                break;
            case NodeType.Paragraph:
                if (!lastIsParagraph) {
                    lastIsParagraph = true;
                    concat.push(...n.content);
                    continue;
                }
                // else: fallthrough to error
            case NodeType.Preformatted:
            case NodeType.BlockModifier:
                msgs.push(new EntityNotAllowedMessage(n.location));
                break;
            case NodeType.SystemModifier:
                lastIsParagraph = false;
                concat.push(n);
                break;
            default:
                debug.never(n);
        }
    }
    return concat;
}
