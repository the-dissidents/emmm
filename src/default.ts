import { debug } from "./debug";
import { ArgumentInterpolatorDefinition, BlockEntity, BlockInstantiationData, BlockModifierDefinition, BlockModifierNode, Configuration, CustomConfiguration, InlineEntity, InlineInstantiationData, InlineModifierDefinition, InlineModifierNode, Message, ModifierFlags, ModifierNode, ParseContext, SystemModifierDefinition } from "./interface";
import { ArgumentsTooFewMessage, ArgumentsTooManyMessage, InlineDefinitonInvalidEntityMessage, InvalidArgumentMessage, NameAlreadyDefinedMessage, SlotUsedOutsideDefinitionMessage, UndefinedVariableMessage } from "./messages";
import { assert, cloneNodes, debugPrintNodes } from "./util";

function checkArgumentLength<T>(node: ModifierNode, n: number) {
    if (node.arguments.length < n)
        return new ArgumentsTooFewMessage(node.head.end - 1, 0, n);
    if (node.arguments.length > n) {
        const start = node.arguments[n].start - 1;
        return new ArgumentsTooManyMessage(start, node.head.end - start, n);
    }
    return null;
}

type _Node<T extends 'inline' | 'block'> = T extends 'inline' 
    ? InlineModifierNode<unknown> 
    : BlockModifierNode<unknown>;

type _Def<T extends 'inline' | 'block', TState> = T extends 'inline' 
    ? InlineModifierDefinition<TState> 
    : BlockModifierDefinition<TState>;

type _InstData<T extends 'inline' | 'block'> = T extends 'inline' 
    ? InlineInstantiationData
    : BlockInstantiationData;

type _Ent<T extends 'inline' | 'block'> = T extends 'inline' 
    ? InlineEntity
    : BlockEntity;

function customModifier<T extends 'inline' | 'block'>(type: T,
    name: string, argNames: string[], slotName: string, content: _Ent<T>[])
{
    debug.info(`registered custom ${type} modifier:`, name);
    debug.info('args:', argNames, `with ${slotName == '' ? 'no slot name' : 'slot name: '+slotName}`)
    debug.trace(() => 'content is\n' + debugPrintNodes(content));

    const mod = (type == 'block' 
        ? new BlockModifierDefinition<{ok: boolean}>(name, ModifierFlags.Normal)
        : new InlineModifierDefinition<{ok: boolean}>(name, ModifierFlags.Normal)
    ) as _Def<T, {ok: boolean}>;

    mod.delayContentExpansion = true;
    mod.prepareExpand = (node: ModifierNode, cxt: ParseContext) => {
        const check = checkArgumentLength(node, argNames.length);
        if (check) return [check];
        node.state = {ok: true};
        return [];
    };
    mod.expand = (node: ModifierNode, cxt: ParseContext) => {
        if (!node.state?.ok) return [];
        const contentClone = cloneNodes(content) as any[];
        return contentClone;
    };
    mod.beforeProcessExpansion = (node: ModifierNode, cxt: ParseContext) => {
        if (!node.state?.ok) return [];
        const data = ({ inline: cxt.inlineSlotData, block: cxt.blockSlotData })[type];
        const args = new Map(
            node.arguments.map((x, i) => [argNames[i], cxt.evaluateArgument(x)]));
        data.push([slotName, { mod: mod as any, args, slotContent: node.content as any }]);
        debug.trace(`pushed ${type} slot data for`, name, 
            slotName == '' ? '(unnamed)' : `= ${slotName}`);
        return [];
    };
    mod.afterProcessExpansion = (node: ModifierNode, cxt: ParseContext) => {
        if (!node.state?.ok) return [];
        const data = ({ inline: cxt.inlineSlotData, block: cxt.blockSlotData })[type];
        const pop = data.pop();
        assert(pop !== undefined && pop[0] == slotName);
        debug.trace(`popped ${type} slot data for`, name,
            slotName == '' ? '(unnamed)' : `= ${slotName}`);
        return [];
    };
    return mod;
}

function slotModifier<T extends 'inline' | 'block'>(type: T): _Def<T, any> {
    type TState = {
        ok: true,
        data: [string, _InstData<T>],
        index: number
    } | { ok: false };

    let mod = (type == 'block' 
        ? new BlockModifierDefinition<TState>('slot', ModifierFlags.Marker)
        : new InlineModifierDefinition<TState>('slot', ModifierFlags.Marker)
    ) as _Def<T, TState>;

    mod.alwaysTryExpand = true;
    mod.prepareExpand = (node: ModifierNode, cxt: ParseContext) => {
        const data = ({ inline: cxt.inlineSlotData, block: cxt.blockSlotData })[type];
        const id = node.arguments.length == 1 ? cxt.evaluateArgument(node.arguments[0]) : '';
        if (data.length == 0) {
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
        const stack = ({ 
            inline: cxt.inlineSlotDelayedStack, 
            block: cxt.blockSlotDelayedStack })[type];
        if (stack.includes(id)) {
            debug.trace('delaying', id == '' ? 'unnamed slot' : 'slot: ' + id);
            return [];
        }
        if (node.arguments.length == 0) {
            node.state = { ok: true, data: data.at(-1)!, index: data.length - 1 };
            return [];
        }
        for (let i = data.length - 1; i >= 0; i--) if (data[i][0] == id) {
            node.state = { ok: true, data: data[i], index: i };
            return [];
        }
        if (cxt.delayDepth == 0) {
            node.state = { ok: false };
            const arg = node.arguments[0];
            return [new InvalidArgumentMessage(arg.start, arg.end - arg.start, id)];
        }
        return [];
    };
    mod.expand = (node: ModifierNode, cxt: ParseContext) => {
        if (!node.state) return undefined;
        if (!node.state.ok) return [];
        return cloneNodes(node.state.data[1].slotContent) as any[];
    };
    mod.beforeProcessExpansion = (node: ModifierNode, cxt: ParseContext) => {
        // TODO: not sure if this works
        if (!node.state?.ok) return [];
        debug.trace('temporarily removed slot data for', node.state.data[1].mod.name);
        const data = ({ inline: cxt.inlineSlotData, block: cxt.blockSlotData })[type];
        data.splice(node.state.index, 1);
        return [];
    };
    mod.afterProcessExpansion = (node: ModifierNode, cxt: ParseContext) => {
        // TODO: not sure if this works
        if (!node.state?.ok) return [];
        debug.trace('reinstated slot data for', node.state.data[1].mod.name);
        const data = ({ inline: cxt.inlineSlotData, block: cxt.blockSlotData })[type];
        data.splice(node.state.index, 0, node.state.data);
        return [];
    };
    return mod;
}

const SlotBlockMod = slotModifier('block');
const SlotInlineMod = slotModifier('inline');

const DefineBlockMod = new SystemModifierDefinition<{
    name: string,
    slotName: string,
    args: string[]
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
        node.state = {name: nameValue, slotName, args};
        
        cxt.blockSlotDelayedStack.push(node.state.slotName);
        debug.trace('entering block definition:', node.state.name);
        return msgs;
    },
    afterParseContent(node, cxt) {
        if (!node.state) return [];
        assert(cxt.blockSlotDelayedStack.pop() == node.state.slotName);
        debug.trace('leaving block definition', node.state.name);
        return [];
    },
    expand(node, cxt) {
        if (cxt.delayDepth > 0) return undefined;
        if (node.state) {
            cxt.config.blockModifiers.set(node.state.name, 
                customModifier('block', node.state.name, node.state.args, 
                    node.state.slotName, node.content));
            cxt.onConfigChange();
        }
        return []
    }
});

const DefineInlineMod = new SystemModifierDefinition<{
    name: string,
    slotName: string,
    args: string[],
    definition?: InlineEntity[],
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
        node.state = {name: nameValue, slotName, args};
        
        cxt.inlineSlotDelayedStack.push(node.state.slotName);
        debug.trace('entering inline definition:', node.state.name);
        return msgs;
    },
    afterParseContent(node, cxt) {
        if (!node.state) return [];
        assert(cxt.inlineSlotDelayedStack.pop() == node.state.slotName);
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
                case "paragraph":
                    if (!lastIsParagraph) {
                        lastIsParagraph = true;
                        concat.push(...n.content);
                        continue;
                    }
                case "pre":
                case "block":
                    msgs.push(new InlineDefinitonInvalidEntityMessage(n.start, n.end - n.start));
                    break;
                case "system":
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
    expand(node, cxt) {
        if (cxt.delayDepth > 0) return undefined;
        if (node.state) {
            cxt.config.inlineModifiers.set(node.state.name, 
                customModifier('inline', node.state.name, node.state.args, 
                    node.state.slotName, node.state.definition!));
            cxt.onConfigChange();
        }
        return []
    },
});

const VarMod = new SystemModifierDefinition<{
    id: string, value: string
}>('var', ModifierFlags.Marker, {
    // .var id:value
    prepareExpand(node, cxt) {
        const check = checkArgumentLength(node, 2);
        if (check) return [check];
        const arg = node.arguments[0];
        const argValue = cxt.evaluateArgument(arg);
        if (argValue == '')
            return [new InvalidArgumentMessage(arg.start, arg.end - arg.start)];
        node.state = {
            id: argValue, 
            value: cxt.evaluateArgument(node.arguments[1])
        };
        return [];
    },
    expand(node, cxt) {
        if (node.state) {
            cxt.variables.set(node.state.id, node.state.value);
            debug.trace('set variable', node.state.id, '=', node.state.value);
        }
        return [];
    },
})

let basic = new CustomConfiguration();
basic.addSystem(DefineBlockMod, DefineInlineMod, VarMod);
basic.addBlock(SlotBlockMod);

function resolveId(id: string, cxt: ParseContext): string | undefined {
    let value: string | undefined = undefined;
    for (let i = cxt.inlineSlotData.length - 1; i >= 0; i--) {
        const [_, data] = cxt.inlineSlotData[i];
        if ((value = data.args.get(id)) !== undefined)
            break;
    }
    for (let i = cxt.blockSlotData.length - 1; i >= 0; i--) {
        const [_, data] = cxt.blockSlotData[i];
        if ((value = data.args.get(id)) !== undefined)
            break;
    }
    if (value === undefined)
        value = cxt.variables.get(id);
    return value;
}

basic.addInline(SlotInlineMod,
    new InlineModifierDefinition<{value: string}>('$', ModifierFlags.Marker, {
        // .$:id
        prepareExpand(node, cxt) {
            const check = checkArgumentLength(node, 1);
            if (check) return [check];
            const arg = node.arguments[0];
            const id = cxt.evaluateArgument(arg);
            if (id == '')
                return [new InvalidArgumentMessage(arg.start, arg.end - arg.start)];

            const value = resolveId(id, cxt);
            if (value === undefined)
                return [new UndefinedVariableMessage(arg.start, arg.end - arg.start, id)];
            node.state = {value};
            return [];
        },
        expand(node, cxt) {
            if (!node.state) return [];
            return [{type: 'text', content: node.state.value, start: -1, end: -1}];
        },
    }),
);
basic.addInterpolator(
    new ArgumentInterpolatorDefinition('$(', ')', 
        (content, cxt) => resolveId(content, cxt) ?? ''
    )
)

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
