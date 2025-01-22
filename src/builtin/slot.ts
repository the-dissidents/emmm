import { debug } from "../debug";
import { BlockModifierDefinition, ModifierFlags, InlineModifierDefinition, ModifierNode, ParseContext } from "../interface";
import { SlotUsedOutsideDefinitionMessage, ArgumentsTooManyMessage, InvalidArgumentMessage } from "../messages";
import { _Def, _InstData } from "../typing-helper";
import { cloneNodes } from "../util";
import { builtins } from "./internal";

function slotModifier<T extends 'inline' | 'block'>(type: T): _Def<T, any> {
    type TState = {
        ok: true;
        data: [string, _InstData<T>];
        index: number;
    } | { ok: false; };

    let mod = (type == 'block'
        ? new BlockModifierDefinition<TState>('slot', ModifierFlags.Marker)
        : new InlineModifierDefinition<TState>('slot', ModifierFlags.Marker)
    ) as _Def<T, TState>;

    mod.alwaysTryExpand = true;
    mod.prepareExpand = (node: ModifierNode, cxt: ParseContext, immediate: boolean) => {
        const store = cxt.get(builtins)!;
        const data = ({ inline: store.inlineSlotData, block: store.blockSlotData })[type];
        const id = node.arguments.length == 1 ? cxt.evaluateArgument(node.arguments[0]) : '';
        if (data.length == 0) {
            if (immediate) {
                node.state = { ok: false };
                return [new SlotUsedOutsideDefinitionMessage(node.start, node.head.end - node.start)];
            }
            return [];
        }
        if (node.arguments.length > 1) {
            if (immediate) {
                node.state = { ok: false };
                const start = node.arguments[1].start - 1;
                return [new ArgumentsTooManyMessage(start, node.head.end - start)];
            }
            return [];
        }
        const stack = ({ inline: store.inlineSlotDelayedStack, block: store.blockSlotDelayedStack })[type];
        if (stack.includes(id)) {
            debug.trace('delaying', id == '' ? 'unnamed slot' : 'slot: ' + id);
            return [];
        }
        if (node.arguments.length == 0) {
            node.state = { ok: true, data: data.at(-1)!, index: data.length - 1 };
            return [];
        }
        for (let i = data.length - 1; i >= 0; i--) if (data[i][0] == id) {
            node.state = { ok: true, data: data[i], index: i };
            return [];
        }
        if (immediate) {
            node.state = { ok: false };
            const arg = node.arguments[0];
            return [new InvalidArgumentMessage(arg.start, arg.end - arg.start, id)];
        }
        return [];
    };
    mod.expand = (node: ModifierNode, cxt: ParseContext) => {
        if (!node.state) return undefined;
        if (!node.state.ok) return [];
        return cloneNodes(node.state.data[1].slotContent) as any[];
    };
    mod.beforeProcessExpansion = (node: ModifierNode, cxt: ParseContext) => {
        // TODO: not sure if this works
        if (!node.state?.ok) return [];
        const store = cxt.get(builtins)!;
        debug.trace('temporarily removed slot data for', node.state.data[1].mod.name);
        const data = ({ inline: store.inlineSlotData, block: store.blockSlotData })[type];
        data.splice(node.state.index, 1);
        return [];
    };
    mod.afterProcessExpansion = (node: ModifierNode, cxt: ParseContext) => {
        // TODO: not sure if this works
        if (!node.state?.ok) return [];
        const store = cxt.get(builtins)!;
        debug.trace('reinstated slot data for', node.state.data[1].mod.name);
        const data = ({ inline: store.inlineSlotData, block: store.blockSlotData })[type];
        data.splice(node.state.index, 0, node.state.data);
        return [];
    };
    return mod;
}

export const SlotBlockMod = slotModifier('block');
export const SlotInlineMod = slotModifier('inline');