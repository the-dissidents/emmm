import { debug } from "../debug";
import { BlockModifierDefinition, ModifierSlotType, InlineModifierDefinition, ModifierNode, NodeType } from "../interface";
import { SlotUsedOutsideDefinitionMessage, InvalidArgumentMessage, EitherNormalOrPreMessage, UnknownModifierMessage } from "../messages";
import { checkArguments } from "../modifier-helper";
import { ParseContext } from "../parser-config";
import { _Def, _Ent, _InstData, _Node } from "../typing-helper";
import { cloneNodes, NameManager } from "../util";
import { builtins, ModifierSignature } from "./internal";

function slotModifier
    <T extends NodeType.InlineModifier | NodeType.BlockModifier>
    (name: string, type: T, preformatted: boolean, inject: boolean): _Def<T, any> 
{
    type TState = {
        ok: true;
        data: _InstData<T>;
        index: number;
        injectMod?: _Def<T>
    } | { ok: false; };

    const mod = (type == NodeType.BlockModifier
        ? new BlockModifierDefinition<TState>(name, ModifierSlotType.None)
        : new InlineModifierDefinition<TState>(name, ModifierSlotType.None)
    ) as _Def<T, TState>;
    const isInline = type == NodeType.InlineModifier;

    mod.alwaysTryExpand = true;
    mod.prepareExpand = (node: ModifierNode<TState>, cxt: ParseContext, immediate: boolean) => {
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
        const check = inject 
            ? checkArguments(node, 1, 2)
            : checkArguments(node, 0, 1);
        if (check) {
            node.state = { ok: false };
            return check;
        }

        const msgs = (() => {
            const store = cxt.get(builtins)!;
            const data = isInline ? store.inlineInstantiationData : store.blockInstantiationData;
            const stack = isInline ? store.inlineSlotDelayedStack : store.blockSlotDelayedStack;
    
            // check inside definition
            if (data.length == 0 && stack.length == 0) {
                node.state = { ok: false };
                return [new SlotUsedOutsideDefinitionMessage(node.start, node.head.end)];
            }
    
            // find default
            if (node.arguments.length == (inject ? 1 : 0)) {
                let signature = stack.at(-1);
                if (signature) return processSignature(signature); // delay
                node.state = { ok: true, data: data.at(-1) as any, index: data.length - 1 };
                return;
            }
    
            // find id
            const id = node.arguments[0].expansion!;
            let signature = stack.find((x) => x.slotName == id);
            if (signature) return processSignature(signature); // delay
            for (let i = data.length - 1; i >= 0; i--) if (data[i].slotName === id) {
                node.state = { ok: true, data: data[i] as any, index: i };
                return;
            }
    
            // not found
            if (immediate) {
                node.state = { ok: false };
                const arg = node.arguments[0];
                return [new InvalidArgumentMessage(arg.start, arg.end, id)];
            }
        })();

        if (inject) {
            const arg = node.arguments.at(-1)!;
            const modName = arg.expansion!;
            const mod = ((isInline 
                ? cxt.config.inlineModifiers : cxt.config.blockModifiers) as NameManager<_Def<T>>)
                .get(modName);
            if (!mod) {
                node.state = { ok: false };
                return [new UnknownModifierMessage(arg.start, arg.end, modName)];
            }
            if (node.state?.ok)
                node.state.injectMod = mod;
        }

        if (msgs) return msgs;
        return [];
    };
    mod.expand = (node: ModifierNode<TState>, cxt: ParseContext) => {
        if (!node.state) return undefined;
        if (!node.state.ok) return [];
        let cloned = cloneNodes(node.state.data.slotContent) as _Ent<T>[];
        if (inject) {
            const mod = node.state.injectMod! as any;
            const modNode: ModifierNode = {
                type, mod,
                start: node.start,
                end: node.end,
                head: { start: node.start, end: node.end },
                arguments: [], // TODO: enable injecting args
                content: cloned as any
            };
            return [modNode];
        } else return cloned as any;
    };
    mod.beforeProcessExpansion = (node: ModifierNode<TState>, cxt: ParseContext) => {
        // TODO: not sure if this works
        if (!node.state?.ok) return [];
        const store = cxt.get(builtins)!;
        debug.trace('temporarily removed slot data for', node.state.data.mod.name);
        const data = isInline ? store.inlineInstantiationData : store.blockInstantiationData;
        data.splice(node.state.index, 1);
        return [];
    };
    mod.afterProcessExpansion = (node: ModifierNode<TState>, cxt: ParseContext) => {
        // TODO: not sure if this works
        if (!node.state?.ok) return [];
        const store = cxt.get(builtins)!;
        debug.trace('reinstated slot data for', node.state.data.mod.name);
        const data = isInline ? store.inlineInstantiationData : store.blockInstantiationData;
        data.splice(node.state.index, 0, node.state.data as any);
        return [];
    };
    return mod;
}

export const SlotBlockMod = slotModifier('slot', NodeType.BlockModifier, false, false);
export const SlotInlineMod = slotModifier('slot', NodeType.InlineModifier, false, false);

export const PreSlotBlockMod = slotModifier('pre-slot', NodeType.BlockModifier, true, false);
export const PreSlotInlineMod = slotModifier('pre-slot', NodeType.InlineModifier, true, false);

export const InjectPreSlotBlockMod = slotModifier(
    'inject-pre-slot', NodeType.BlockModifier, true, true);
export const InjectPreSlotInlineMod = slotModifier(
    'inject-pre-slot', NodeType.InlineModifier, true, true);