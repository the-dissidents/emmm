import { debug } from "../debug";
import { BlockEntity, InlineEntity } from "../interface";
import { ParseContext, ModifierNode, BlockModifierDefinition, InlineModifierDefinition, ModifierFlags, NodeType } from "../interface";
import { checkArguments } from "../modifier-helper";
import { _Ent, _Def } from "../typing-helper";
import { debugPrintNodes, cloneNodes, assert } from "../util";

export type ModifierSignature = {
    slotName: string,
    args: string[]
}

export type BlockInstantiationData = {
    mod: BlockModifierDefinition<any>
    slotContent: BlockEntity[]
    args: Map<string, string>
}

export type InlineInstantiationData = {
    mod: InlineModifierDefinition<any>
    slotContent: InlineEntity[]
    args: Map<string, string>
}

export const builtins = Symbol();

declare module '../interface' {
    export interface ParseContextStoreDefinitions {
        [builtins]?: {
            blockSlotDelayedStack: ModifierSignature[];
            inlineSlotDelayedStack: ModifierSignature[];
            blockSlotData: [string, BlockInstantiationData][];
            inlineSlotData: [string, InlineInstantiationData][];
            notationStack: {
                blocks: readonly BlockModifierDefinition<unknown>[],
                inlines: readonly InlineModifierDefinition<unknown>[],
                inlineShorthands: readonly InlineShorthand<unknown>[],
                blockShorthands: readonly BlockShorthand<unknown>[]
            }[];
        };
    }
}

export function initParseContext(cxt: ParseContext) {
    cxt.init(builtins, {
        blockSlotDelayedStack: [],
        inlineSlotDelayedStack: [],
        blockSlotData: [],
        inlineSlotData: [],
        notationStack: []
    });
}

export function customModifier<T extends NodeType.InlineModifier | NodeType.BlockModifier>(
    type: T, name: string, flag: ModifierFlags, argNames: string[], slotName: string, content: _Ent<T>[])
{
    debug.info(`created custom ${NodeType[type]}:`, name);
    debug.info('args:', argNames, `with ${slotName == '' ? 'no slot name' : 'slot name: ' + slotName}`);
    debug.trace(() => 'content is\n' + debugPrintNodes(content));

    type State = {
        ok: boolean,
        args: Map<string, string>
    }

    const mod = (type == NodeType.BlockModifier
        ? new BlockModifierDefinition<State>(name, flag)
        : new InlineModifierDefinition<State>(name, flag)
    ) as _Def<T, State>;
    const isInline = type == NodeType.InlineModifier;

    mod.delayContentExpansion = true;
    mod.prepareExpand = (node: ModifierNode<State>, cxt: ParseContext) => {
        let check = checkArguments(node, argNames.length);
        if (check) return check;
        node.state = { 
            ok: true,
            args: new Map(node.arguments.map((x, i) => [argNames[i], x.expansion!]))
        } satisfies State;
        return [];
    };
    mod.expand = (node: ModifierNode<State>, cxt: ParseContext) => {
        if (!node.state?.ok) return [];
        const contentClone = cloneNodes(content) as any[];
        return contentClone;
    };
    mod.beforeProcessExpansion = (node: ModifierNode<State>, cxt: ParseContext) => {
        if (!node.state?.ok) return [];
        const store = cxt.get(builtins)!;
        const data = isInline ? store.inlineSlotData : store.blockSlotData;
        data.push([slotName, { 
            mod: mod as any, args: node.state.args, 
            slotContent: node.content as any 
        }]);
        debug.trace(`pushed ${NodeType[type]} slot data for`, name,
            slotName == '' ? '(unnamed)' : `= ${slotName}`);
        return [];
    };
    mod.afterProcessExpansion = (node: ModifierNode<State>, cxt: ParseContext) => {
        if (!node.state?.ok) return [];
        const store = cxt.get(builtins)!;
        const data = isInline ? store.inlineSlotData : store.blockSlotData;
        const pop = data.pop();
        assert(pop !== undefined && pop[0] == slotName);
        debug.trace(`popped ${NodeType[type]} slot data for`, name,
            slotName == '' ? '(unnamed)' : `= ${slotName}`);
        return [];
    };
    return mod;
}


