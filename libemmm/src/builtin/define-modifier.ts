import { debug } from "../debug";
import { SystemModifierDefinition, ModifierFlags, Message, NodeType, ParseContext, SystemModifierNode, InlineEntity } from "../interface";
import { InvalidArgumentMessage, NameAlreadyDefinedMessage } from "../messages";
import { checkArgumentLength } from "../modifier-helper";
import { assert } from "../util";
import { builtins, customModifier, makeInlineDefinition, ModifierSignature } from "./internal";

type ModifierState = {
    name?: string;
    signature: ModifierSignature;
    msgs: Message[];
};

function parseDefineArguments(
    node: SystemModifierNode<ModifierState>,
    stack: ModifierSignature[]
) {
    const check = checkArgumentLength(node, 1, Infinity);
    if (check) return check;

    const msgs: Message[] = [];
    const name = node.arguments[0];
    const nameValue = name.expansion;
    if (nameValue === '' || nameValue?.includes('\n')) return [
        new InvalidArgumentMessage(name.start, name.end, nameValue)];

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

    let signature: ModifierSignature = { slotName, args, preformatted: undefined };
    node.state = { name: nameValue, signature, msgs };
    stack.push(signature);
    return undefined;
}

export const DefineBlockMod = new SystemModifierDefinition
    <ModifierState>('define-block', ModifierFlags.Normal, 
{
    // .define-block:name:args...[:(slot-id)]
    delayContentExpansion: true,
    alwaysTryExpand: true,
    beforeParseContent(node, cxt) {
        const store = cxt.get(builtins)!;
        const check = parseDefineArguments(node, store.blockSlotDelayedStack);
        if (check) return check;
        debug.trace('entering block definition:', node.state!.name);
        return [];
    },
    afterParseContent(node, cxt) {
        if (!node.state) return [];
        const store = cxt.get(builtins)!;
        const pop = store.blockSlotDelayedStack.pop();
        assert(pop === node.state.signature);
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
            cxt.config.blockModifiers.add(customModifier(NodeType.BlockModifier, 
                node.state.name, node.state.signature, node.content));
        }
        return [];
    }
});

export const DefineInlineMod = new SystemModifierDefinition
    <ModifierState & { definition?: InlineEntity[]; }>(
    'define-inline', ModifierFlags.Normal, 
{
    // .define-inline name:args...[:(slot-id)]
    delayContentExpansion: true,
    alwaysTryExpand: true,
    beforeParseContent(node, cxt) {
        const store = cxt.get(builtins)!;
        const check = parseDefineArguments(node, store.inlineSlotDelayedStack);
        if (check) return check;
        debug.trace('entering inline definition:', node.state!.name);
        return [];
    },
    afterParseContent(node, cxt) {
        if (!node.state) return [];
        const store = cxt.get(builtins)!;
        const pop = store.inlineSlotDelayedStack.pop();
        assert(pop === node.state.signature);
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
        
        node.state.definition = makeInlineDefinition(node, msgs);
        return msgs;
    },
    expand(node, cxt, immediate) {
        if (!immediate) return undefined;
        if (node.state?.name) {
            if (cxt.config.inlineModifiers.has(node.state.name))
                cxt.config.inlineModifiers.remove(node.state.name);
            cxt.config.inlineModifiers.add(
                customModifier(NodeType.InlineModifier, 
                    node.state.name, node.state.signature, node.state.definition!));
        }
        return [];
    },
});