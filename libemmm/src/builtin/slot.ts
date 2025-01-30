import { debug } from "../debug";
import { BlockModifierDefinition, ModifierFlags, InlineModifierDefinition, ModifierNode, ParseContext, NodeType } from "../interface";
import { SlotUsedOutsideDefinitionMessage, InvalidArgumentMessage } from "../messages";
import { checkArgumentLength } from "../modifier-helper";
import { _Def, _InstData } from "../typing-helper";
import { cloneNodes } from "../util";
import { builtins } from "./internal";

function slotModifier<T extends NodeType.InlineModifier | NodeType.BlockModifier>(type: T): _Def<T, any> {
    type TState = {
        ok: true;
        data: [string, _InstData<T>];
        index: number;
    } | { ok: false; };

    const mod = (type == NodeType.BlockModifier
        ? new BlockModifierDefinition<TState>('slot', ModifierFlags.Marker)
        : new InlineModifierDefinition<TState>('slot', ModifierFlags.Marker)
    ) as _Def<T, TState>;
    const isInline = type == NodeType.InlineModifier;

    mod.alwaysTryExpand = true;
    mod.prepareExpand = (node: ModifierNode, cxt: ParseContext, immediate: boolean) => {
        if (node.state) return [];

        const check = checkArgumentLength(node, 0, 1);
        if (check && immediate) {
            node.state = { ok: false };
            return check;
        }

        const store = cxt.get(builtins)!;
        const data = isInline ? store.inlineSlotData : store.blockSlotData;
        let id = '';
        if (node.arguments.length == 1) {
            const arg = node.arguments[0];
            if (!arg.expansion) {
                node.state = { ok: false };
                return [new InvalidArgumentMessage(arg.start, arg.end)];
            }
            id = arg.expansion;
        }
        if (data.length == 0) {
            if (immediate) {
                node.state = { ok: false };
                return [new SlotUsedOutsideDefinitionMessage(node.start, node.head.end)];
            }
            return [];
        }
        const stack = isInline ? store.inlineSlotDelayedStack : store.blockSlotDelayedStack;
        if (stack.find((x) => x.slotName == id)) {
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
            return [new InvalidArgumentMessage(arg.start, arg.end, id)];
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
        const data = isInline ? store.inlineSlotData : store.blockSlotData;
        data.splice(node.state.index, 1);
        return [];
    };
    mod.afterProcessExpansion = (node: ModifierNode, cxt: ParseContext) => {
        // TODO: not sure if this works
        if (!node.state?.ok) return [];
        const store = cxt.get(builtins)!;
        debug.trace('reinstated slot data for', node.state.data[1].mod.name);
        const data = isInline ? store.inlineSlotData : store.blockSlotData;
        data.splice(node.state.index, 0, node.state.data);
        return [];
    };
    return mod;
}

export const SlotBlockMod = slotModifier(NodeType.BlockModifier);
export const SlotInlineMod = slotModifier(NodeType.InlineModifier);
