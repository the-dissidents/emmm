import { debug } from "../debug";
import { SystemModifierDefinition, InlineEntity, ModifierFlags, Message, NodeType } from "../interface";
import { NameAlreadyDefinedMessage, InlineDefinitonInvalidEntityMessage, InvalidArgumentMessage } from "../messages";
import { checkArgumentLength } from "../modifier-helper";
import { assert } from "../util";
import { builtins, customModifier } from "./internal";

export const DefineInlineMod = new SystemModifierDefinition<{
    name?: string;
    slotName: string;
    args: string[];
    msgs: Message[];
    definition?: InlineEntity[];
}>('define-inline', ModifierFlags.Normal, {
    // .define-inline name:args...[:(slot-id)]
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
        store.inlineSlotDelayedStack.push({ slotName, args });
        debug.trace('entering inline definition:', node.state.name);
        return [];
    },
    afterParseContent(node, cxt) {
        if (!node.state) return [];
        const store = cxt.get(builtins)!;
        assert(store.inlineSlotDelayedStack.pop()?.slotName == node.state.slotName);
        debug.trace('leaving inline definition', node.state.name);
        return [];
    },
    prepareExpand(node, cxt, immediate) {
        if (!immediate || !node.state) return [];
        const arg = node.arguments[0];
        if (!node.state.name) 
            return [new InvalidArgumentMessage(arg.start, arg.end)];

        const msgs = node.state.msgs;
        if (cxt.config.inlineModifiers.has(node.state.name))
            msgs.push(new NameAlreadyDefinedMessage(arg.start, arg.end, node.state.name));
                
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
                    msgs.push(new InlineDefinitonInvalidEntityMessage(n.start, n.end));
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
        if (node.state?.name) {
            if (cxt.config.inlineModifiers.has(node.state.name))
                cxt.config.inlineModifiers.remove(node.state.name);
            cxt.config.inlineModifiers.add(
                customModifier(NodeType.InlineModifier, node.state.name, 
                    ModifierFlags.Normal,
                    node.state.args, node.state.slotName, node.state.definition!));
        }
        return [];
    },
});
