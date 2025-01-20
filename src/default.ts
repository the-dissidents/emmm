import { debug } from "./debug";
import { BlockEntity, BlockInstantiationData, BlockModifierDefinition, BlockModifierNode, Configuration, CustomConfiguration, InlineModifierDefinition, InlineModifierNode, Message, ModifierFlags, ParseContext } from "./interface";
import { ArgumentsTooFewMessage, ArgumentsTooManyMessage, InlineDefinitonMustContainOneParaMessage, InvalidArgumentMessage, NameAlreadyDefinedMessage, SlotUsedOutsideDefinitionMessage, UndefinedVariableMessage } from "./messages";
import { assert, cloneNodes, debugPrintNodes } from "./util";

function checkArgumentLength<T>(node: BlockModifierNode<T> | InlineModifierNode<T>, n: number) {
    if (node.arguments.length < n)
        return new ArgumentsTooFewMessage(node.head.end - 1, 0, n);
    if (node.arguments.length > n) {
        const start = node.arguments[n].start - 1;
        return new ArgumentsTooManyMessage(start, node.head.end - start, n);
    }
    return null;
}

function customBlockModifier(
    name: string, argNames: string[], slotName: string, content: BlockEntity[]) 
{
    debug.info('registered custom block modifier:', name);
    debug.info('args:', argNames, `with ${slotName == '' ? 'no slot name' : 'slot name: '+slotName}`)
    debug.trace(() => 'content is\n' + debugPrintNodes(content));
    const mod = new BlockModifierDefinition<{
        ok: boolean
        // TODO: args
    }>(name, ModifierFlags.Normal, {
        delayContentExpansion: true,
        prepare(node, cxt) {
            const check = checkArgumentLength(node, argNames.length);
            if (check) return [check];
            node.state = {ok: true};
            return [];
        },
        expand(node, cxt) {
            if (!node.state?.ok) return [];
            const contentClone = cloneNodes(content) as BlockEntity[];
            return contentClone;
        },
        beforeProcessExpansion(node, cxt) {
            if (!node.state?.ok) return [];
            cxt.blockSlotData.push([slotName, { mod, args: [], slotContent: node.content }]);
            debug.trace('pushed slot data for', name, 
                slotName == '' ? '(unnamed)' : `= ${slotName}`);
            return [];
        },
        afterProcessExpansion(node, cxt) {
            if (!node.state?.ok) return [];
            const pop = cxt.blockSlotData.pop();
            assert(pop !== undefined && pop[0] == slotName);
            debug.trace('popped slot data for', name,
                slotName == '' ? '(unnamed)' : `= ${slotName}`);
            return [];
        },
    });
    return mod;
}

function customInlineModifier(
    name: string, argNames: string[], slotName: string, content: BlockEntity) 
{
    debug.trace('registered custom inline modifier:', name);
    return new InlineModifierDefinition(name, ModifierFlags.Normal, {
        delayContentExpansion: true,
        afterProcessExpansion(node, config) {
            debug.trace('parsing custom inline modifier:', name);
            const check = checkArgumentLength(node, argNames.length);
            if (check) return [check];
            // TODO
            return [];
        }
    });
}

const blockSlot = new BlockModifierDefinition<{
    ok: true,
    data: [string, BlockInstantiationData],
    index: number
} | { ok: false }>(
    'slot', ModifierFlags.Marker, {
    // .slot [id]
    alwaysTryExpand: true,
    prepare(node, cxt) {
        if (cxt.blockSlotData.length == 0) {
            if (cxt.delayDepth == 0) {
                node.state = { ok: false };
                return [new SlotUsedOutsideDefinitionMessage(node.start, node.head.end - node.start)];
            }
            return [];
        }

        if (node.arguments.length > 1) {
            if (cxt.delayDepth == 0) {
                node.state = { ok: false };
                const start = node.arguments[1].start - 1;
                return [new ArgumentsTooManyMessage(start, node.head.end - start)];
            }
            return [];
        }
        if (cxt.blockSlotDelayedStack.length > 0) {
            const search = node.arguments.at(0)?.content ?? '';
            if (cxt.blockSlotDelayedStack.includes(search)) {
                debug.trace('delaying', search == '' ? 'unnamed slot' : 'slot: ' + search);
                return [];
            }
        }
        if (node.arguments.length == 1) {
            const arg = node.arguments[0];
            const data = cxt.blockSlotData;
            for (let i = data.length - 1; i >= 0; i--)
                if (data[i][0] == arg.content) {
                    node.state = {
                        ok: true,
                        data: data[i],
                        index: i
                    };
                    return [];
                }
            if (cxt.delayDepth == 0) {
                node.state = { ok: false };
                return [new InvalidArgumentMessage(arg.start, arg.end - arg.start, arg.content)];
            }
            return [];
        } else {
            node.state = {
                ok: true,
                data: cxt.blockSlotData.at(-1)!,
                index: cxt.blockSlotData.length - 1
            };
            return [];
        }
    },
    expand(node, cxt) {
        if (!node.state) return undefined;
        if (!node.state.ok) return [];
        return cloneNodes(node.state.data[1].slotContent) as BlockEntity[];
    },
    beforeProcessExpansion(node, cxt) {
        // TODO: not sure if this works
        if (!node.state?.ok) return [];
        debug.trace('temporarily removed slot data for', node.state.data[1].mod.name);
        cxt.blockSlotData.splice(node.state.index, 1);
        return [];
    },
    afterProcessExpansion(node, cxt) {
        // TODO: not sure if this works
        if (!node.state?.ok) return [];
        debug.trace('reinstated slot data for', node.state.data[1].mod.name);
        cxt.blockSlotData.splice(node.state.index, 0, node.state.data);
        return [];
    },
});

let basic = new CustomConfiguration();
basic.addBlock(
    new BlockModifierDefinition<{
        name: string,
        slotName: string,
        args: string[]
    }>('define-block', ModifierFlags.Normal, {
        // .define-block:name:args...[:(slot-id)]
        delayContentExpansion: true,
        alwaysTryExpand: true,
        prepare(node, cxt) {
            if (node.arguments.length == 0)
                return [new ArgumentsTooFewMessage(node.head.end - 1, 0)];
            const msgs: Message[] = [];
            const name = node.arguments[0];
            if (cxt.config.blockModifiers.has(name.content))
                msgs.push(new NameAlreadyDefinedMessage(
                    node.start, name.end - name.start, name.content));
            const last = node.arguments.at(-1)!.content;
            const slotName = (node.arguments.length > 1 && /^\(.+\)$/.test(last)) 
                ? last.substring(1, last.length - 1)
                : '';
            const args = node.arguments.slice(1, (slotName !== '') ? node.arguments.length - 1 : undefined).map((x) => x.content);
            node.state = {name: name.content, slotName, args};
            return msgs;
        },
        expand(node, cxt) {
            if (cxt.delayDepth > 0) return undefined;
            if (node.state) {
                cxt.config.blockModifiers.set(node.state.name, 
                    customBlockModifier(node.state.name, node.state.args, 
                        node.state.slotName, node.content));
                cxt.onConfigChange();
            }
            return []
        },
        beforeParseContent(node, cxt) {
            if (!node.state) return [];
            cxt.blockSlotDelayedStack.push(node.state.slotName);
            debug.trace('entering block definition:', node.state.name);
            return [];
        },
        afterParseContent(node, cxt) {
            if (!node.state) return [];
            assert(cxt.blockSlotDelayedStack.pop() == node.state.slotName);
            debug.trace('leaving block definition', node.state.name);
            return [];
        },
    }),
    new BlockModifierDefinition<{
        name: string,
        slotName: string,
        args: string[]
    }>('define-inline', ModifierFlags.Normal, {
        // .define-inline name:args...[:(slot-id)]
        delayContentExpansion: true,
        beforeProcessExpansion(node, cxt) {
            if (node.arguments.length == 0)
                return [new ArgumentsTooFewMessage(node.head.end - 1, 0)];
            const msgs: Message[] = [];
            const name = node.arguments[0];
            if (cxt.config.inlineModifiers.has(name.content))
                msgs.push(new NameAlreadyDefinedMessage(
                    node.start, name.end - name.start, name.content));
            if (node.content.length != 1)
                msgs.push(new InlineDefinitonMustContainOneParaMessage(
                    node.head.end, node.end - node.head.end));
            if (node.content.length > 0) {
                const last = node.arguments.at(-1)!.content;
                const slotName = (node.arguments.length > 1 && /^\(.+\)$/.test(last)) 
                    ? last.substring(1, last.length - 1)
                    : '';
                const args = node.arguments.slice(1, (slotName !== '') ? node.arguments.length - 1 : undefined).map((x) => x.content);
                node.state = {name: name.content, slotName, args};
                // cxt.inlineSlotInDefinition.push(slotName);
            }
            return msgs;
        },
        afterProcessExpansion(node, cxt) {
            if (!node.state) return [];
            // assert(cxt.inlineSlotInDefinition.pop() == node.state.slotName);
            cxt.config.inlineModifiers.set(node.state.name, 
                customInlineModifier(node.state.name, node.state.args, 
                    node.state.slotName, node.content[0]));
            cxt.onConfigChange();
            return [];
        },
    }),
    new BlockModifierDefinition<{id: string, value: string}>('var', ModifierFlags.Marker, {
        // .var id:value
        prepare(node, cxt) {
            const check = checkArgumentLength(node, 2);
            if (check) return [check];
            const arg = node.arguments[0];
            if (arg.content == '')
                return [new InvalidArgumentMessage(arg.start, arg.end - arg.start)];
            node.state = {id: arg.content, value: node.arguments[1].content};
            return [];
        },
        expand(node, cxt) {
            if (node.state)
                cxt.variables.set(node.state.id, node.state.value);
            return [];
        },
    }),
    blockSlot
);
basic.addInline(
    new InlineModifierDefinition<{id: string}>('$', ModifierFlags.Marker, {
        // .$:id
        prepare(node, cxt) {
            const check = checkArgumentLength(node, 1);
            if (check) return [check];
            const arg = node.arguments[0];
            if (arg.content == '')
                return [new InvalidArgumentMessage(arg.start, arg.end - arg.start)];
            if (!cxt.variables.has(arg.content))
                return [new UndefinedVariableMessage(arg.start, arg.end - arg.start, arg.content)];
            node.state = {id: arg.content};
            return [];
        },
        expand(node, cxt) {
            if (!node.state) return [];
            const value = cxt.variables.get(node.state.id);
            assert(value !== undefined);
            return [{type: 'text', content: value, start: -1, end: -1}];
        },
    }),
);

let config = new CustomConfiguration(basic);

config.addBlock(
    new BlockModifierDefinition('quote', ModifierFlags.Normal), 
    new BlockModifierDefinition('eq', ModifierFlags.Preformatted)
);

config.addInline(
    new InlineModifierDefinition('eq', ModifierFlags.Preformatted),
    new InlineModifierDefinition('emphasis', ModifierFlags.Normal),
    new InlineModifierDefinition('underline', ModifierFlags.Normal)
);

export const BasicConfiguration: Configuration = Object.freeze(basic);
export const DefaultConfiguration: Configuration = Object.freeze(config);
