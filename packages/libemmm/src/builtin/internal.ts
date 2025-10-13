import { debug } from "../debug";
import { debugPrint } from "../debug-print";
import { BlockEntity, InlineEntity, Message, SystemModifierNode, ModifierNode, BlockModifierDefinition, InlineModifierDefinition, ModifierSlotType, NodeType } from "../interface";
import { EntityNotAllowedMessage } from "../messages";
import { checkArguments } from "../modifier-helper";
import { ParseContext } from "../parser-config";
import { _Ent, _Def } from "../typing-helper";
import { cloneNodes, assert } from "../util";
import { ConfigDefinitions } from "./module";

export type ModifierSignature = {
    readonly slotName: string | undefined;
    readonly args: readonly string[];
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
            blockSlotDelayedStack: ModifierSignature[];
            inlineSlotDelayedStack: ModifierSignature[];
            blockInstantiationData: BlockInstantiationData[];
            inlineInstantiationData: InlineInstantiationData[];
            modules: Map<string, ConfigDefinitions>;
            usedModules: Set<string>;
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
        modules: new Map(),
        usedModules: new Set(),
        insideModule: undefined
    });
}

export function customModifier<T extends NodeType.InlineModifier | NodeType.BlockModifier>(
    type: T, name: string, signature: ModifierSignature, content: _Ent<T>[])
{
    debug.info(`created custom ${NodeType[type]}:`, name);
    debug.info('args:', signature.args, `with ${signature.slotName === undefined ? 'no slot' : signature.slotName == '' ? 'empty slot name' : 'slot name: ' + signature.slotName}`);
    debug.trace(() => 'content is\n' + debugPrint.node(...content));

    type State = {
        ok: boolean,
        args: Map<string, string>
    }

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
    mod.prepareExpand = (node: ModifierNode<State>, cxt: ParseContext) => {
        let check = checkArguments(node, signature.args.length);
        if (check) return check;
        node.state = { 
            ok: true,
            args: new Map(node.arguments.map((x, i) => [signature.args[i], x.expansion!]))
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

export function makeInlineDefinition(node: SystemModifierNode<any>, msgs: Message[]) {
    let lastIsParagraph = false;
    let concat: InlineEntity[] = [];
    for (const n of node.content) {
        switch (n.type) {
            case NodeType.Paragraph:
                if (!lastIsParagraph) {
                    lastIsParagraph = true;
                    concat.push(...n.content);
                    continue;
                }
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
