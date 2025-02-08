import { debug } from "../debug";
import { BlockModifierDefinition, ModifierFlags, InlineModifierDefinition, ModifierNode, ParseContext, NodeType } from "../interface";
import { SlotUsedOutsideDefinitionMessage, InvalidArgumentMessage, EitherNormalOrPreMessage } from "../messages";
import { checkArgumentLength } from "../modifier-helper";
import { _Def, _InstData } from "../typing-helper";
import { cloneNodes } from "../util";
import { builtins, ModifierSignature } from "./internal";

function slotModifier
    <T extends NodeType.InlineModifier | NodeType.BlockModifier>
    (name: string, type: T, preformatted: boolean): _Def<T, any> 
{
    type TState = {
        ok: true;
        data: [string, _InstData<T>];
        index: number;
    } | { ok: false; };

    const mod = (type == NodeType.BlockModifier
        ? new BlockModifierDefinition<TState>(name, ModifierFlags.Marker)
        : new InlineModifierDefinition<TState>(name, ModifierFlags.Marker)
    ) as _Def<T, TState>;
    const isInline = type == NodeType.InlineModifier;

    mod.alwaysTryExpand = true;
    mod.prepareExpand = (node: ModifierNode, cxt: ParseContext, immediate: boolean) => {
        if (!immediate) debug.trace('early expanding', name);
        if (node.state) return [];

        function processSignature(s: ModifierSignature) {
            if (s.preformatted === undefined) {
                s.preformatted = preformatted;
                debug.trace('set preformatted to ', preformatted);
            } else if (s.preformatted !== preformatted) {
                return [new EitherNormalOrPreMessage(node.start, node.end)];
            }
            return [];
        }
        
        // check args
        const check = checkArgumentLength(node, 0, 1);
        if (check) {
            node.state = { ok: false };
            return check;
        } 

        const store = cxt.get(builtins)!;
        const data = isInline ? store.inlineSlotData : store.blockSlotData;
        const stack = isInline ? store.inlineSlotDelayedStack : store.blockSlotDelayedStack;

        // check inside definition
        if (data.length == 0 && stack.length == 0) {
            node.state = { ok: false };
            return [new SlotUsedOutsideDefinitionMessage(node.start, node.head.end)];
        }

        // find default
        if (node.arguments.length == 0) {
            let signature = stack.at(-1);
            if (signature) return processSignature(signature); // delay
            node.state = { ok: true, data: data.at(-1)!, index: data.length - 1 };
            return [];
        }

        // find id
        const arg = node.arguments[0];
        if (!arg.expansion) {
            node.state = { ok: false };
            return [new InvalidArgumentMessage(arg.start, arg.end)];
        }
        const id = arg.expansion;
        let signature = stack.find((x) => x.slotName == id);
        if (signature) return processSignature(signature); // delay
        for (let i = data.length - 1; i >= 0; i--) if (data[i][0] == id) {
            node.state = { ok: true, data: data[i], index: i };
            return [];
        }

        // not found
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

export const SlotBlockMod = slotModifier('slot', NodeType.BlockModifier, false);
export const SlotInlineMod = slotModifier('slot', NodeType.InlineModifier, false);

export const PreSlotBlockMod = slotModifier('pre-slot', NodeType.BlockModifier, true);
export const PreSlotInlineMod = slotModifier('pre-slot', NodeType.InlineModifier, true);
