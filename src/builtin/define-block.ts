import { debug } from "../debug";
import { SystemModifierDefinition, ModifierFlags, Message } from "../interface";
import { ArgumentsTooFewMessage, NameAlreadyDefinedMessage } from "../messages";
import { assert } from "../util";
import { builtins, customModifier } from "./internal";

export const DefineBlockMod = new SystemModifierDefinition<{
    name: string;
    slotName: string;
    args: string[];
}>('define-block', ModifierFlags.Normal, {
    // .define-block:name:args...[:(slot-id)]
    delayContentExpansion: true,
    alwaysTryExpand: true,
    beforeParseContent(node, cxt) {
        if (node.arguments.length == 0)
            return [new ArgumentsTooFewMessage(node.head.end - 1, 0)];

        const msgs: Message[] = [];
        const name = node.arguments[0];
        const nameValue = cxt.evaluateArgument(name);
        if (cxt.config.blockModifiers.has(nameValue))
            msgs.push(new NameAlreadyDefinedMessage(
                node.start, name.end - name.start, nameValue));

        let slotName = '';
        if (node.arguments.length > 1) {
            const last = cxt.evaluateArgument(node.arguments.at(-1)!);
            slotName = /^\(.+\)$/.test(last) ? last.substring(1, last.length - 1) : '';
        }
        const args = node.arguments.slice(1, (slotName !== '')
            ? node.arguments.length - 1 : undefined).map((x) => cxt.evaluateArgument(x));
        node.state = { name: nameValue, slotName, args };

        const store = cxt.get(builtins)!;
        store.blockSlotDelayedStack.push(node.state.slotName);
        debug.trace('entering block definition:', node.state.name);
        return msgs;
    },
    afterParseContent(node, cxt) {
        if (!node.state) return [];
        const store = cxt.get(builtins)!;
        assert(store.blockSlotDelayedStack.pop() == node.state.slotName);
        debug.trace('leaving block definition', node.state.name);
        return [];
    },
    expand(node, cxt, immediate) {
        if (!immediate) return undefined;
        if (node.state) {
            cxt.config.blockModifiers.set(node.state.name,
                customModifier('block', node.state.name, node.state.args,
                    node.state.slotName, node.content));
            cxt.onConfigChange();
        }
        return [];
    }
});
