import { debug } from "../debug";
import { ParseContext, ModifierNode, BlockModifierDefinition, InlineModifierDefinition, ModifierFlags, NodeType } from "../interface";
import { ArgumentsTooFewMessage, ArgumentsTooManyMessage } from "../messages";
import { _Ent, _Def } from "../typing-helper";
import { debugPrintNodes, cloneNodes, assert } from "../util";

export const builtins = Symbol();
declare module '../interface' {
    export interface ParseContextStoreDefinitions {
        [builtins]?: {
            blockSlotDelayedStack: string[];
            inlineSlotDelayedStack: string[];
            blockSlotData: [string, BlockInstantiationData][];
            inlineSlotData: [string, InlineInstantiationData][];
        };
    }
}

export function initParseContext(cxt: ParseContext) {
    cxt.init(builtins, {
        blockSlotDelayedStack: [],
        inlineSlotDelayedStack: [],
        blockSlotData: [],
        inlineSlotData: []
    });
}

export function checkArgumentLength(node: ModifierNode, n: number) {
    if (node.arguments.length < n)
        return new ArgumentsTooFewMessage(node.head.end - 1, 0, n);
    if (node.arguments.length > n) {
        const start = node.arguments[n].start - 1;
        return new ArgumentsTooManyMessage(start, node.head.end - start, n);
    }
    return null;
}

export function customModifier<T extends NodeType.InlineModifier | NodeType.BlockModifier>(
    type: T, name: string, argNames: string[], slotName: string, content: _Ent<T>[])
{
    debug.info(`registered custom ${type} modifier:`, name);
    debug.info('args:', argNames, `with ${slotName == '' ? 'no slot name' : 'slot name: ' + slotName}`);
    debug.trace(() => 'content is\n' + debugPrintNodes(content));

    const mod = (type == NodeType.BlockModifier
        ? new BlockModifierDefinition<{ ok: boolean; }>(name, ModifierFlags.Normal)
        : new InlineModifierDefinition<{ ok: boolean; }>(name, ModifierFlags.Normal)
    ) as _Def<T, { ok: boolean; }>;
    const isInline = type == NodeType.InlineModifier;

    mod.delayContentExpansion = true;
    mod.prepareExpand = (node: ModifierNode, cxt: ParseContext) => {
        const check = checkArgumentLength(node, argNames.length);
        if (check) return [check];
        node.state = { ok: true };
        return [];
    };
    mod.expand = (node: ModifierNode, cxt: ParseContext) => {
        if (!node.state?.ok) return [];
        const contentClone = cloneNodes(content) as any[];
        return contentClone;
    };
    mod.beforeProcessExpansion = (node: ModifierNode, cxt: ParseContext) => {
        if (!node.state?.ok) return [];
        const store = cxt.get(builtins)!;
        const args = new Map(
            node.arguments.map((x, i) => [argNames[i], cxt.evaluateArgument(x)]));
        const data = isInline ? store.inlineSlotData : store.blockSlotData;
        data.push([slotName, { mod: mod as any, args, slotContent: node.content as any }]);
        debug.trace(`pushed ${type} slot data for`, name,
            slotName == '' ? '(unnamed)' : `= ${slotName}`);
        return [];
    };
    mod.afterProcessExpansion = (node: ModifierNode, cxt: ParseContext) => {
        if (!node.state?.ok) return [];
        const store = cxt.get(builtins)!;
        const data = isInline ? store.inlineSlotData : store.blockSlotData;
        const pop = data.pop();
        assert(pop !== undefined && pop[0] == slotName);
        debug.trace(`popped ${type} slot data for`, name,
            slotName == '' ? '(unnamed)' : `= ${slotName}`);
        return [];
    };
    return mod;
}
