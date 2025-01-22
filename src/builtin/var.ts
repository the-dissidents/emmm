import { debug } from "../debug";
import { ParseContext, InlineModifierDefinition, ModifierFlags, ArgumentInterpolatorDefinition, SystemModifierDefinition } from "../interface";
import { InvalidArgumentMessage, UndefinedVariableMessage } from "../messages";
import { builtins, checkArgumentLength } from "./internal";

function resolveId(id: string, cxt: ParseContext): string | undefined {
    const store = cxt.get(builtins)!;
    let value: string | undefined = undefined;
    for (let i = store.inlineSlotData.length - 1; i >= 0; i--) {
        const [_, data] = store.inlineSlotData[i];
        if ((value = data.args.get(id)) !== undefined)
            break;
    }
    for (let i = store.blockSlotData.length - 1; i >= 0; i--) {
        const [_, data] = store.blockSlotData[i];
        if ((value = data.args.get(id)) !== undefined)
            break;
    }
    if (value === undefined)
        value = cxt.variables.get(id);
    return value;
}

export const GetVarInlineMod = new InlineModifierDefinition<{ value: string; }>('$', ModifierFlags.Marker, {
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
        node.state = { value };
        return [];
    },
    expand(node, cxt) {
        if (!node.state) return [];
        return [{ type: 'text', content: node.state.value, start: -1, end: -1 }];
    },
});

export const GetVarInterpolator = new ArgumentInterpolatorDefinition('$(', ')',
    (content, cxt) => resolveId(content, cxt) ?? ''
);

export const VarMod = new SystemModifierDefinition<{
    id: string; value: string;
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
});