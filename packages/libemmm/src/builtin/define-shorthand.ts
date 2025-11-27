import { debug } from "../debug";
import { debugPrint } from "../debug-print";
import { SystemModifierDefinition, InlineEntity, ModifierSlotType, Message, NodeType, SystemModifierNode, InlineShorthand, BlockShorthand, ModifierArgument } from "../interface";
import { NameAlreadyDefinedMessage, InvalidArgumentMessage, ArgumentCountMismatchMessage } from "../messages";
import { bindArgs } from "../modifier-helper";
import { assert } from "../util";
import { builtins, customModifier, makeInlineDefinition, ModifierSignature } from "./internal";

type ShorthandState = {
    name: string;
    nameNode: ModifierArgument;
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
    let { msgs, args, nodes, rest, restNodes } = bindArgs(node, ['name'], { rest: true });
    if (msgs) return msgs;
    
    msgs = [];
    const nameNode = nodes!.name;
    const name = args!.name;
    if (name === '' || name?.includes('\n')) return [
        new InvalidArgumentMessage(nameNode.location, name)];

    let slotName: string | undefined = undefined;
    let parts: [string, string][] = [];
    let postfix: string | undefined = undefined;
    let i = 0;
    while (i < rest!.length) {
        const arg = restNodes![i];
        const match = /^\((.*)\)$/.exec(arg.expansion!);
        if (match) {
            slotName = match[1];
            i++;
            if (type == NodeType.InlineModifier) {
                if (i < rest!.length) {
                    if (rest![i] === '') {
                        msgs.push(new InvalidArgumentMessage(
                            restNodes![i].location, 'postfix'));
                    } else {
                        postfix = rest![i];
                        i++;
                    }
                } else msgs.push(
                    new ArgumentCountMismatchMessage(node.head));
            }
            break;
        }
        
        i++;
        if (i < rest!.length) {
            const id = arg.expansion!;
            if (id === '')
                return [new InvalidArgumentMessage(arg.location, 'id')];
            const part = rest![i];
            if (part === '')
                return [new InvalidArgumentMessage(restNodes![i].location, 'part')];
            parts.push([id, part]);
            i++;
        } else {
            msgs.push(new ArgumentCountMismatchMessage(node.head));
            break;
        }
    }
    
    if (i == rest!.length - 1) {
        if (rest![i] !== '') msgs.push(
            new InvalidArgumentMessage(restNodes![i].location, '(must be empty)'));
    } else if (i < rest!.length - 1)
        msgs.push(new ArgumentCountMismatchMessage(node.head));

    let signature: ModifierSignature = 
        { slotName, args: parts.map((x) => x[0]), preformatted: undefined };
    node.state = { name, nameNode, signature, parts, postfix, msgs };
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
    beforeParseContent(node, cxt, immediate) {
        if (!immediate) return [];

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
        if (!node.state.name) 
            return [new InvalidArgumentMessage(node.state.nameNode.location)];

        const msgs = node.state.msgs;
        if (cxt.config.blockShorthands.has(node.state.name))
            msgs.push(new NameAlreadyDefinedMessage(node.state.nameNode.location, node.state.name));
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
    beforeParseContent(node, cxt, immediate) {
        if (!immediate) return [];

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
        if (!node.state.name) 
            return [new InvalidArgumentMessage(node.state.nameNode.location)];

        const msgs = node.state.msgs;
        if (cxt.config.inlineShorthands.has(node.state.name))
            msgs.push(new NameAlreadyDefinedMessage(node.state.nameNode.location, node.state.name));
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