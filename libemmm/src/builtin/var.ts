import { debug } from "../debug";
import { InlineModifierDefinition, ModifierSlotType, ArgumentInterpolatorDefinition, SystemModifierDefinition, NodeType, BlockModifierDefinition } from "../interface";
import { InvalidArgumentMessage, UndefinedVariableMessage } from "../messages";
import { builtins } from "./internal";
import { checkArguments } from "../modifier-helper";
import { ParseContext } from "../parser-config";

function resolveId(id: string, cxt: ParseContext): string | undefined {
    const store = cxt.get(builtins)!;
    // delay if it is a yet unknown argument
    if (store.inlineSlotDelayedStack.find((x) => x.args.includes(id))
     || store.blockSlotDelayedStack.find((x) => x.args.includes(id)))
    {
        debug.trace('delaying the yet unknown argument', id);
        return undefined;
    }

    let value: string | undefined = undefined;
    for (let i = store.inlineInstantiationData.length - 1; i >= 0; i--) {
        const data = store.inlineInstantiationData[i];
        if ((value = data.args.get(id)) !== undefined)
            break;
    }
    for (let i = store.blockInstantiationData.length - 1; i >= 0; i--) {
        const data = store.blockInstantiationData[i];
        if ((value = data.args.get(id)) !== undefined)
            break;
    }
    if (value === undefined)
        value = cxt.variables.get(id);
    return value;
}

let ifdefBlock = (name: string, x: boolean) =>
    new BlockModifierDefinition<boolean>
    (name, ModifierSlotType.Normal,
{
    prepareExpand(node, cxt) {
        const check = checkArguments(node, 1);
        if (check) return check;
        const arg = node.arguments[0];
        const id = arg.expansion!;
        if (id == '') return [new InvalidArgumentMessage(arg.location)];
        const value = resolveId(id, cxt);
        node.state = value !== undefined;
        return [];
    },
    expand(node) {
        return (node.state == x) ? node.content : [];
    }
});

let ifdefInline = (name: string, x: boolean) =>
    new InlineModifierDefinition<boolean>
    (name, ModifierSlotType.Normal,
{
    prepareExpand(node, cxt) {
        const check = checkArguments(node, 1);
        if (check) return check;
        const arg = node.arguments[0];
        const id = arg.expansion!;
        if (id == '') return [new InvalidArgumentMessage(arg.location)];
        const value = resolveId(id, cxt);
        node.state = value !== undefined;
        return [];
    },
    expand(node) {
        return (node.state == x) ? node.content : [];
    }
});

export const IfdefBlockMod = ifdefBlock('ifdef', true);
export const IfndefBlockMod = ifdefBlock('ifndef', false);
export const IfdefInlineMod = ifdefInline('ifdef', true);
export const IfndefInlineMod = ifdefInline('ifndef', false);

export const GetVarInlineMod = 
    new InlineModifierDefinition<{ value: string; }>('$', ModifierSlotType.None, 
{
    alwaysTryExpand: true,
    // .$:id
    prepareExpand(node, cxt, immediate) {
        const check = checkArguments(node, 1);
        if (check)
            return immediate ? check : [];

        const arg = node.arguments[0];
        const id = arg.expansion!;
        if (id == '')
            return immediate ? [new InvalidArgumentMessage(arg.location)] : [];

        const value = resolveId(id, cxt);
        if (value === undefined)
            return immediate ? [new UndefinedVariableMessage(arg.location, id)] : [];
        node.state = { value };
        return [];
    },
    expand(node, _, immediate) {
        if (!node.state) return immediate ? [] : undefined;
        return [{ type: NodeType.Text, content: node.state.value, location: node.location }];
    },
});

export const PrintInlineMod = 
    new InlineModifierDefinition<{ value: string; }>('print', ModifierSlotType.None, 
{
    // .print:args...
    prepareExpand(node) {
        const check = checkArguments(node);
        if (check) return check;
        node.state = {value: node.arguments.map((x) => x.expansion!).join('')};
        return [];
    },
    expand(node) {
        if (!node.state) return [];
        return [{ type: NodeType.Text, content: node.state.value, location: node.location }];
    },
});

export const GetVarInterpolator = 
    new ArgumentInterpolatorDefinition('$(', ')',
{
    alwaysTryExpand: true,
    expand(content, cxt) {
        const result = resolveId(content, cxt);
        if (result !== undefined) debug.trace(`$(${content}) --> ${result}`);
        return result;
    },
});

export const VarMod = new SystemModifierDefinition<{
    id: string; value: string;
}>('var', ModifierSlotType.None, {
    // .var id:value
    prepareExpand(node, cxt) {
        const check = checkArguments(node, 2);
        if (check) return check;

        const arg = node.arguments[0];
        const id = arg.expansion!;
        if (id == '')
            return [new InvalidArgumentMessage(arg.location)];
        node.state = {
            id,
            value: node.arguments[1].expansion!
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
});
