import { debug } from "../debug";
import { debugPrint } from "../debug-print";
import { SystemModifierDefinition, InlineEntity, ModifierSlotType, Message, NodeType, SystemModifierNode, InlineShorthand, BlockShorthand } from "../interface";
import { NameAlreadyDefinedMessage, InvalidArgumentMessage, ArgumentCountMismatchMessage } from "../messages";
import { checkArguments } from "../modifier-helper";
import { assert } from "../util";
import { builtins, customModifier, makeInlineDefinition, ModifierSignature } from "./internal";

type ShorthandState = {
    name: string;
    parts: [string, string][];
    postfix: string | undefined;
    signature: ModifierSignature;
    msgs: Message[];
};

function parseDefineArguments(
    type: NodeType.BlockModifier | NodeType.InlineModifier,
    node: SystemModifierNode<ShorthandState>,
    stack: ModifierSignature[]
) {
    const check = checkArguments(node, 1, Infinity);
    if (check) return check;
    
    const msgs: Message[] = [];
    const name = node.arguments[0];
    const nameValue = name.expansion!;
    if (nameValue === '' || nameValue?.includes('\n')) return [
        new InvalidArgumentMessage(name.start, name.end, nameValue)];

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
            if (type == NodeType.InlineModifier) {
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
            }
            break;
        }
        
        i++;
        if (i < node.arguments.length) {
            const id = arg.expansion!;
            if (id === '') {
                return [new InvalidArgumentMessage(arg.start, arg.end, 'id')];
            }
            const part = node.arguments[i].expansion!;
            if (part === '') {
                return [new InvalidArgumentMessage(
                    node.arguments[i].start, node.arguments[i].end, 'part')];
            }
            parts.push([id, part]);
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
        msgs.push(new ArgumentCountMismatchMessage(node.start, node.end));

    let signature: ModifierSignature = 
        { slotName, args: parts.map((x) => x[0]), preformatted: undefined };
    node.state = { name: nameValue, signature, parts, postfix, msgs };
    stack.push(signature);
    return [];
}

export const DefineBlockShorthandMod = new SystemModifierDefinition
    <ShorthandState>
    ('block-shorthand', ModifierSlotType.Normal, 
{
    // -inline-shorthand prefix:arg1:part1:arg2:part2...:(slot):postfix:
    delayContentExpansion: true,
    alwaysTryExpand: true,
    beforeParseContent(node, cxt) {
        const store = cxt.get(builtins)!;
        const check = parseDefineArguments(NodeType.BlockModifier, 
            node, store.blockSlotDelayedStack);
        if (check) return check;
        debug.trace('entering block shorthand definition', node.state!.name);
        return [];
    },
    afterParseContent(node, cxt) {
        if (!node.state) return [];
        const store = cxt.get(builtins)!;
        const pop = store.blockSlotDelayedStack.pop();
        assert(pop === node.state.signature);
        debug.trace('leaving inline shorthand definition', node.state.name);
        return [];
    },
    prepareExpand(node, cxt, immediate) {
        if (!immediate || !node.state) return [];
        const arg = node.arguments[0];
        if (!node.state) 
            return [new InvalidArgumentMessage(arg.start, arg.end)];
        const msgs = node.state.msgs;
        if (cxt.config.blockShorthands.has(node.state.name))
            msgs.push(new NameAlreadyDefinedMessage(arg.start, arg.end, node.state.name));
        return msgs;
    },
    expand(node, cxt, immediate) {
        if (!immediate || !node.state) return undefined;
        const name = '<block shorthand>';
        const parts = node.state.parts.map((x) => x[1]);
        const mod = customModifier(NodeType.BlockModifier, 
            name, node.state.signature, node.content);
        const shorthand: BlockShorthand<any> = {
            name: node.state.name,
            postfix: node.state.postfix,
            mod, parts
        };
        if (cxt.config.blockShorthands.has(node.state.name))
            cxt.config.blockShorthands.remove(node.state.name);
        cxt.config.blockShorthands.add(shorthand);
        debug.info(() => 'created block shorthand: ' + debugPrint.blockShorthand(shorthand));
        return [];
    },
});

export const DefineInlineShorthandMod = new SystemModifierDefinition
    <ShorthandState & { definition?: InlineEntity[]; }>
    ('inline-shorthand', ModifierSlotType.Normal, 
{
    // -inline-shorthand prefix:arg1:part1:arg2:part2...:(slot):postfix:
    delayContentExpansion: true,
    alwaysTryExpand: true,
    beforeParseContent(node, cxt) {
        const store = cxt.get(builtins)!;
        const check = parseDefineArguments(NodeType.InlineModifier, 
            node, store.inlineSlotDelayedStack);
        if (check) return check;
        debug.trace('entering inline shorthand definition', node.state!.name);
        return [];
    },
    afterParseContent(node, cxt) {
        if (!node.state) return [];
        const store = cxt.get(builtins)!;
        const pop = store.inlineSlotDelayedStack.pop();
        assert(pop === node.state.signature);
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
        node.state.definition = makeInlineDefinition(node, msgs);
        return msgs;
    },
    expand(node, cxt, immediate) {
        if (!immediate || !node.state) return undefined;
        const name = '<inline shorthand>';
        const parts = node.state.parts.map((x) => x[1]);
        const mod = customModifier(NodeType.InlineModifier, 
            name, node.state.signature, node.state.definition!);
        const shorthand: InlineShorthand<any> = {
            name: node.state.name,
            postfix: node.state.postfix,
            mod, parts
        };
        if (cxt.config.inlineShorthands.has(node.state.name))
            cxt.config.inlineShorthands.remove(node.state.name);
        cxt.config.inlineShorthands.add(shorthand);
        debug.info(() => 'created inline shorthand: ' + debugPrint.inlineShorthand(shorthand));
        return [];
    },
});