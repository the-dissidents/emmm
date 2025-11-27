import { debug } from "../debug";
import { BlockModifierDefinition, ModifierSlotType, InlineModifierDefinition, ModifierNode, NodeType } from "../interface";
import { SlotUsedOutsideDefinitionMessage, InvalidArgumentMessage, EitherNormalOrPreMessage, UnknownModifierMessage } from "../messages";
import { bindArgs } from "../modifier-helper";
import { ParseContext } from "../parser-config";
import { _Def, _Ent, _InstData, _Node } from "../typing-helper";
import { assert, cloneNodes, NameManager } from "../util";
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
                return [new EitherNormalOrPreMessage(node.location)];
            }
            return [];
        }
        
        // check args
        const check = inject 
            ? bindArgs(node, ['modname'], { optional: ['id'] })
            : bindArgs(node, [], { optional: ['id'] });
        if (check.msgs) {
            node.state = { ok: false };
            return check.msgs;
        }

        const store = cxt.get(builtins)!;
        const data = isInline ? store.inlineInstantiationData : store.blockInstantiationData;
        const stack = isInline ? store.inlineSlotDelayedStack : store.blockSlotDelayedStack;

        let msgs = (() => {
            // check inside definition
            if (data.length == 0 && stack.length == 0) {
                node.state = { ok: false };
                return [new SlotUsedOutsideDefinitionMessage(node.location)];
            }

            // find default
            const id = check.args.id;
            if (!id) {
                let signature = stack.at(-1);
                if (signature) return processSignature(signature); // delay
                node.state = { ok: true, data: data.at(-1) as any, index: data.length - 1 };
                return;
            }

            // find id
            let signature = stack.find((x) => x.slotName == id);
            if (signature) return processSignature(signature); // delay
            for (let i = data.length - 1; i >= 0; i--) if (data[i].slotName === id) {
                node.state = { ok: true, data: data[i] as any, index: i };
                return;
            }

            // not found
            if (immediate) {
                node.state = { ok: false };
                return [new InvalidArgumentMessage(check.nodes.id!.location, id)];
            }
            return [];
        })();

        if (inject) {
            // @ts-expect-error
            const modname = check.args.modname;
            // @ts-expect-error
            const modnameNode = check.nodes.modname;
            const mod = ((isInline 
                ? cxt.config.inlineModifiers 
                : cxt.config.blockModifiers) as NameManager<_Def<T>>).get(modname);
            if (!mod) {
                node.state = { ok: false };
                return [new UnknownModifierMessage(modnameNode.location, modname)];
            }

            if (node.state?.ok)
                node.state.injectMod = mod;
        }

        if (msgs !== undefined) return msgs;
        return [];
    };
    mod.expand = (node: ModifierNode<TState>, cxt: ParseContext) => {
        if (!node.state) return undefined;
        if (!node.state.ok) return [];
        let cloned = cloneNodes(node.state.data.slotContent) as _Ent<T>[];
        if (inject) {
            assert(node.state.injectMod !== undefined);
            const mod = node.state.injectMod as any;
            const modNode: ModifierNode = {
                type, mod,
                location: node.location,
                head: node.head,
                arguments: {
                    positional: [],
                    named: new Map()
                }, // TODO: enable injecting args
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