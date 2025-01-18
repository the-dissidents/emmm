import { BlockEntity, BlockModifierDefinition, BlockModifierNode, Configuration, CustomConfiguration, InlineModifierDefinition, InlineModifierNode, Message, ModifierFlags, ParseContext } from "./interface";
import { ArgumentsTooFewMessage, ArgumentsTooManyMessage, InlineDefinitonMustContainOneParaMessage, InvalidArgumentMessage, NameAlreadyDefinedMessage, SlotUsedOutsideDefinitionMessage, UndefinedVariableMessage } from "./messages";
import { assert, cloneNodes } from "./util";

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
    console.log('registered custom block modifier:', name);
    return new BlockModifierDefinition<{
        ok: boolean
    }>(name, ModifierFlags.Normal, {
        beforeParse(node, cxt) {
            const check = checkArgumentLength(node, argNames.length);
            if (check) return [check];
            node.state = {ok: true};
            cxt.blockSlotData.push([slotName, content]);
            return [];
        },
        parse(node, cxt) {
            if (node.state?.ok) {
                const pop = cxt.blockSlotData.pop();
                assert(pop !== undefined && pop[0] == slotName);
            }
            return [];
        },
        expand(node, cxt) {
            if (node.state?.ok) {
                return cloneNodes(content) as BlockEntity[];
            }
            return [];
        },
    });
}

function customInlineModifier(
    name: string, argNames: string[], slotName: string, content: BlockEntity) 
{
    console.log('registered custom inline modifier:', name);
    return new InlineModifierDefinition(name, ModifierFlags.Normal, {
        parse(node, config) {
            console.log('parsing custom inline modifier:', name);
            const check = checkArgumentLength(node, argNames.length);
            if (check) return [check];
            // TODO
            return [];
        }
    });
}

let basic = new CustomConfiguration();
basic.addBlock(
    new BlockModifierDefinition<{
        name: string,
        slotName: string,
        args: string[]
    }>('define-block', ModifierFlags.Normal, {
        // .define-block:name:args...[:(slot-id)]
        beforeParse(node, cxt) {
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
            cxt.blockSlotInDefinition.push(slotName);
            return msgs;
        },
        parse(node, cxt) {
            if (!node.state) return [];
            assert(cxt.blockSlotInDefinition.pop() == node.state.slotName);
            return [];
        },
        expand(node, cxt) {
            if (node.state) {
                cxt.config.blockModifiers.set(node.state.name, 
                    customBlockModifier(node.state.name, node.state.args, 
                        node.state.slotName, node.content));
                cxt.onConfigChange();
            }
            return []
        }
    }),
    new BlockModifierDefinition<{
        name: string,
        slotName: string,
        args: string[]
    }>('define-inline', ModifierFlags.Normal, {
        // .define-inline name:args...[:(slot-id)]
        beforeParse(node, cxt) {
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
                cxt.inlineSlotInDefinition.push(slotName);
            }
            return msgs;
        },
        parse(node, cxt) {
            if (!node.state) return [];
            assert(cxt.inlineSlotInDefinition.pop() == node.state.slotName);
            cxt.config.inlineModifiers.set(node.state.name, 
                customInlineModifier(node.state.name, node.state.args, 
                    node.state.slotName, node.content[0]));
            cxt.onConfigChange();
            return [];
        },
    }),
    new BlockModifierDefinition<{id: string, value: string}>('var', ModifierFlags.Marker, {
        // .var id:value
        parse(node, cxt) {
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
    new BlockModifierDefinition<{
        data: BlockEntity[]
    }>('slot', ModifierFlags.Marker, {
        // .slot [id]
        parse(node, cxt) {
            if (node.arguments.length > 1) {
                const start = node.arguments[1].start - 1;
                return [new ArgumentsTooManyMessage(start, node.head.end - start)];
            }
            if (cxt.blockSlotInDefinition.length > 0) {
                if (node.arguments.length == 1) {
                    const arg = node.arguments[0];
                    if (cxt.blockSlotInDefinition.indexOf(arg.content) == -1)
                        return [new InvalidArgumentMessage(
                            arg.start, arg.end - arg.start, 'slot id')];
                }
                node.state = undefined; 
                return [];
            } else if (cxt.blockSlotData.length > 0) {
                const arg = node.arguments.length == 1 ? node.arguments[0].content : '';
                for (let i = cxt.blockSlotData.length - 1; i >= 0; i--) {
                    let [id, data] = cxt.blockSlotData[i];
                    if (id == arg)
                        node.state = {data: cloneNodes(data) as BlockEntity[]};
                }
                return [];
            } else return [new SlotUsedOutsideDefinitionMessage(node.start, node.end - node.start)];
        },
        expand(node, cxt) {
            if (!node.state) return [];
            return node.state.data;
        }
    }),
);
basic.addInline(
    new InlineModifierDefinition<{id: string}>('$', ModifierFlags.Marker, {
        // .$:id
        parse(node, cxt) {
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
