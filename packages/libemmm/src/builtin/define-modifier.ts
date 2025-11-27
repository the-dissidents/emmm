import { debug } from "../debug";
import { SystemModifierDefinition, ModifierSlotType, Message, NodeType, SystemModifierNode, InlineEntity, ModifierArgument } from "../interface";
import { InvalidArgumentMessage, NameAlreadyDefinedMessage } from "../messages";
import { bindArgs } from "../modifier-helper";
import { assert } from "../util";
import { builtins, customModifier, makeInlineDefinition, ModifierSignature } from "./internal";

type ModifierState = {
    name: string;
    nameNode: ModifierArgument;
    signature: ModifierSignature;
    msgs: Message[];
};

function parseDefineArguments(
    node: SystemModifierNode<ModifierState>,
    stack: ModifierSignature[]
) {
    let { msgs, args, nodes, rest } = bindArgs(node, ['name'], { rest: true });
    if (msgs) return msgs;

    msgs = [];
    const nameNode = nodes!.name;
    const name = args!.name;
    if (name === '' || name?.includes('\n')) return [
        new InvalidArgumentMessage(nameNode.location, name)];

    let slotName = '';
    if (rest!.length > 0) {
        const last = rest!.at(-1)!;
        const match = /^\((.*)\)$/.exec(last);
        if (match) {
            slotName = match[1];
            rest!.pop();
        } else
            slotName = '';
    }

    let signature: ModifierSignature = { slotName, args: rest!, preformatted: undefined };
    node.state = { name, nameNode, signature, msgs };
    stack.push(signature);
    return undefined;
}

export const DefineBlockMod = new SystemModifierDefinition
    <ModifierState>('define-block', ModifierSlotType.Normal, 
{
    // .define-block:name:args...[:(slot-id)]
    delayContentExpansion: true,
    alwaysTryExpand: true,
    beforeParseContent(node, cxt, immediate) {
        const store = cxt.get(builtins)!;
        const check = parseDefineArguments(node, store.blockSlotDelayedStack);
        if (check) {
            if (immediate) return check;
            else {
                debug.trace('skipping incomplete definition');
                return [];
            }
        }
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
        const msgs = node.state.msgs;
        if (!node.state.name) 
            msgs.push(new InvalidArgumentMessage(node.state.nameNode.location));
        else if (cxt.config.blockModifiers.has(node.state.name))
            msgs.push(new NameAlreadyDefinedMessage(node.state.nameNode.location, node.state.name));
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
    'define-inline', ModifierSlotType.Normal, 
{
    // .define-inline name:args...[:(slot-id)]
    delayContentExpansion: true,
    alwaysTryExpand: true,
    beforeParseContent(node, cxt, immediate) {
        const store = cxt.get(builtins)!;
        const check = parseDefineArguments(node, store.inlineSlotDelayedStack);
        if (check) {
            if (immediate) return check;
            else {
                debug.trace('skipping incomplete definition');
                return [];
            }
        }
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

        if (!node.state.name) 
            return [new InvalidArgumentMessage(node.state.nameNode.location)];

        const msgs = node.state.msgs;
        if (cxt.config.inlineModifiers.has(node.state.name))
            msgs.push(new NameAlreadyDefinedMessage(node.state.nameNode.location, node.state.name));
        
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