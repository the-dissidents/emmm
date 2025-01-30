import { debug } from "../debug";
import { SystemModifierDefinition, InlineEntity, ModifierFlags, Message, NodeType } from "../interface";
import { NameAlreadyDefinedMessage, InlineDefinitonInvalidEntityMessage, InvalidArgumentMessage, ArgumentCountMismatchMessage } from "../messages";
import { checkArgumentLength, checkArguments } from "../modifier-helper";
import { assert } from "../util";
import { builtins, customModifier } from "./internal";

export const DefineInlineShorthandMod = new SystemModifierDefinition<{
    name: string;
    parts: [string, string][];
    postfix: string | undefined;
    slotName: string | undefined;
    msgs: Message[];
    definition?: InlineEntity[];
}>('inline-shorthand', ModifierFlags.Normal, {
    // -inline-shorthand prefix:arg1:part1:arg2:part2...:(slot):postfix:
    delayContentExpansion: true,
    alwaysTryExpand: true,
    beforeParseContent(node, cxt) {
        const check = checkArguments(node, 1, Infinity);
        if (check) return check;
        
        const msgs: Message[] = [];
        const name = node.arguments[0];
        const nameValue = name.expansion!;

        let slotName: string | undefined = undefined;
        let parts: [string, string][] = [];
        let postfix: string | undefined = undefined;
        let i = 1;
        while (i < node.arguments.length) {
            const arg = node.arguments[i];
            const match = /^\((.*)\)$/.exec(arg.expansion!);
            if (match) {
                slotName = match[1];
                i++;
                if (i < node.arguments.length) {
                    if (node.arguments[i].expansion === '') {
                        msgs.push(new InvalidArgumentMessage(
                            node.arguments[i].start, node.arguments[i].end, 'postfix'));
                    } else {
                        postfix = node.arguments[i].expansion!;
                        i++;
                    }
                } else msgs.push(
                    new ArgumentCountMismatchMessage(node.start, node.end));
                break;
            }
            
            i++;
            if (i < node.arguments.length) {
                parts.push([arg.expansion!, node.arguments[i].expansion!]);
                i++;
            } else {
                msgs.push(new ArgumentCountMismatchMessage(node.start, node.end));
                break;
            }
        }
        
        if (i == node.arguments.length - 1) {
            const last = node.arguments[i];
            if (last.expansion !== '') msgs.push(
                new InvalidArgumentMessage(last.start, last.end, '(must be empty)'));
        } else if (i < node.arguments.length - 1)
            msgs.push( new ArgumentCountMismatchMessage(node.start, node.end));

        node.state = { name: nameValue, slotName, parts, postfix, msgs };
        const store = cxt.get(builtins)!;
        if (slotName !== undefined)
            store.inlineSlotDelayedStack.push({ slotName, args: parts.map((x) => x[0]) });
        debug.trace('entering inline shorthand definition', nameValue);
        return [];
    },
    afterParseContent(node, cxt) {
        if (node.state?.slotName === undefined) return [];
        const store = cxt.get(builtins)!;
        assert(store.inlineSlotDelayedStack.pop()?.slotName == node.state.slotName);
        debug.trace('leaving inline shorthand definition', node.state.name);
        return [];
    },
    prepareExpand(node, cxt, immediate) {
        if (!immediate || !node.state) return [];
        const arg = node.arguments[0];
        if (!node.state) 
            return [new InvalidArgumentMessage(arg.start, arg.end)];

        const msgs = node.state.msgs;
        if (cxt.config.inlineShorthands.has(node.state.name))
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
        if (!immediate || !node.state) return undefined;
        const name = '<inline shorthand>';
        const args = node.state.parts.map((x) => x[0]);
        const parts = node.state.parts.map((x) => x[1]);
        const mod = customModifier(NodeType.InlineModifier, name, 
            (node.state.slotName !== undefined) ? ModifierFlags.Normal : ModifierFlags.Marker,
            args, node.state.slotName ?? '', 
            node.state.definition!);
        cxt.config.inlineShorthands.add({
            name: node.state.name,
            postfix: node.state.postfix,
            mod, parts
        });
        
        debug.info(() => 'created inline shorthand: ' 
            + node.state!.name 
            + node.state!.parts.map(([a, b]) => ` .. <arg:${a}> .. ${b}`).join('') 
            + ((node.state!.slotName !== undefined)
                ? ` .. <slot> .. ${node.state?.postfix ?? '<no postfix>'}` 
                : ''));
        return [];
    },
});
