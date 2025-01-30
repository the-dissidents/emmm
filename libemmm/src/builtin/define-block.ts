import { debug } from "../debug";
import { SystemModifierDefinition, ModifierFlags, Message, NodeType } from "../interface";
import { InvalidArgumentMessage, NameAlreadyDefinedMessage } from "../messages";
import { checkArgumentLength } from "../modifier-helper";
import { assert } from "../util";
import { builtins, customModifier } from "./internal";

export const DefineBlockMod = new SystemModifierDefinition<{
    name?: string;
    slotName: string;
    args: string[];
    msgs: Message[];
}>('define-block', ModifierFlags.Normal, {
    // .define-block:name:args...[:(slot-id)]
    delayContentExpansion: true,
    alwaysTryExpand: true,
    beforeParseContent(node, cxt) {
        const check = checkArgumentLength(node, 1, Infinity);
        if (check) return check;

        const msgs: Message[] = [];
        const name = node.arguments[0];
        const nameValue = name.expansion;

        let slotName = '';
        if (node.arguments.length > 1) {
            const last = node.arguments.at(-1)!;
            if (last.expansion) {
                const match = /^\((.*)\)$/.exec(last.expansion);
                slotName = match ? match[1] : '';
            } else msgs.push(
                new InvalidArgumentMessage(last.start, last.end));
        }

        const args = node.arguments.slice(1, (slotName !== '')
            ? node.arguments.length - 1 : undefined).map((x) => 
        {
            if (!x.expansion) msgs.push(
                new InvalidArgumentMessage(x.start, x.end));
            return x.expansion ?? '';
        });
        node.state = { name: nameValue, slotName, args, msgs };

        const store = cxt.get(builtins)!;
        store.blockSlotDelayedStack.push({ slotName, args });
        debug.trace('entering block definition:', node.state.name);
        return [];
    },
    afterParseContent(node, cxt) {
        if (!node.state) return [];
        const store = cxt.get(builtins)!;
        assert(store.blockSlotDelayedStack.pop()?.slotName == node.state.slotName);
        debug.trace('leaving block definition', node.state.name);
        return [];
    },
    prepareExpand(node, cxt, immediate) {
        if (!immediate || !node.state) return [];
        const arg = node.arguments[0];
        const msgs = node.state.msgs;
        if (!node.state.name) 
            msgs.push(new InvalidArgumentMessage(arg.start, arg.end));
        else if (cxt.config.blockModifiers.has(node.state.name))
            msgs.push(new NameAlreadyDefinedMessage(arg.start, arg.end, node.state.name));
        return msgs;
    },
    expand(node, cxt, immediate) {
        if (!immediate) return undefined;
        if (node.state?.name) {
            if (cxt.config.blockModifiers.has(node.state.name))
                cxt.config.blockModifiers.remove(node.state.name);
            cxt.config.blockModifiers.add(
                customModifier(NodeType.BlockModifier, node.state.name, 
                    ModifierFlags.Normal,
                    node.state.args, node.state.slotName, node.content));
        }
        return [];
    }
});
