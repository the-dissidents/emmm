import { debug } from "../debug";
import { SystemModifierDefinition, InlineEntity, ModifierFlags, Message, NodeType } from "../interface";
import { ArgumentsTooFewMessage, NameAlreadyDefinedMessage, InlineDefinitonInvalidEntityMessage } from "../messages";
import { assert } from "../util";
import { builtins, customModifier } from "./internal";

export const DefineInlineMod = new SystemModifierDefinition<{
    name: string;
    slotName: string;
    args: string[];
    definition?: InlineEntity[];
}>('define-inline', ModifierFlags.Normal, {
    // .define-inline name:args...[:(slot-id)]
    delayContentExpansion: true,
    alwaysTryExpand: true,
    beforeParseContent(node, cxt) {
        if (node.arguments.length == 0)
            return [new ArgumentsTooFewMessage(node.head.end - 1, 0)];
        const msgs: Message[] = [];
        const name = node.arguments[0];
        const nameValue = cxt.evaluateArgument(name);
        if (cxt.config.inlineModifiers.has(nameValue))
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
        store.inlineSlotDelayedStack.push(node.state.slotName);
        debug.trace('entering inline definition:', node.state.name);
        return msgs;
    },
    afterParseContent(node, cxt) {
        if (!node.state) return [];
        const store = cxt.get(builtins)!;
        assert(store.inlineSlotDelayedStack.pop() == node.state.slotName);
        debug.trace('leaving inline definition', node.state.name);
        return [];
    },
    prepareExpand(node, cxt) {
        if (!node.state) return [];
        const msgs: Message[] = [];
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
                    msgs.push(new InlineDefinitonInvalidEntityMessage(n.start, n.end - n.start));
                    break;
                case NodeType.SystemModifier:
                    lastIsParagraph = false;
                    concat.push(n);
                    break;
                default:
                    debug.never(n);
            }
        }
        node.state.definition = concat;
        return msgs;
    },
    expand(node, cxt, immediate) {
        if (!immediate) return undefined;
        if (node.state) {
            cxt.config.inlineModifiers.set(node.state.name,
                customModifier(NodeType.InlineModifier, node.state.name, node.state.args,
                    node.state.slotName, node.state.definition!));
            cxt.onConfigChange();
        }
        return [];
    },
});
