import { debug } from "../debug";
import { ParseContext, InlineModifierDefinition, ModifierFlags, ArgumentInterpolatorDefinition, SystemModifierDefinition, NodeType } from "../interface";
import { InvalidArgumentMessage, UndefinedVariableMessage } from "../messages";
import { builtins } from "./internal";
import { checkArgumentLength, checkArguments } from "../modifier-helper";

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
        const check = checkArguments(node, 1);
        if (check) return check;

        const arg = node.arguments[0];
        const id = arg.expansion!;
        if (id == '')
            return [new InvalidArgumentMessage(arg.start, arg.end)];

        const value = resolveId(id, cxt);
        if (value === undefined)
            return [new UndefinedVariableMessage(arg.start, arg.end, id)];
        node.state = { value };
        return [];
    },
    expand(node, cxt) {
        if (!node.state) return [];
        return [{ type: NodeType.Text, content: node.state.value, start: -1, end: -1 }];
    },
});

export const PrintInlineMod = new InlineModifierDefinition<{ value: string; }>('print', ModifierFlags.Marker, {
    // .print:args...
    prepareExpand(node) {
        const check = checkArguments(node);
        if (check) return check;
        node.state = {value: node.arguments.map((x) => x.expansion!).join('')};
        return [];
    },
    expand(node) {
        if (!node.state) return [];
        return [{ type: NodeType.Text, content: node.state.value, start: -1, end: -1 }];
    },
});

export const GetVarInterpolator = new ArgumentInterpolatorDefinition('$(', ')',
    {
        alwaysTryExpand: true,
        expand(content, cxt, immediate) {
            const result = resolveId(content, cxt);
            if (result === undefined) debug.trace('var interp failed:', content);
            else debug.trace(`$(${content}) --> ${result}`);
            return result;
        },
    }
);

export const VarMod = new SystemModifierDefinition<{
    id: string; value: string;
}>('var', ModifierFlags.Marker, {
    // .var id:value
    prepareExpand(node, cxt) {
        const check = checkArguments(node, 2);
        if (check) return check;

        const arg = node.arguments[0];
        const id = arg.expansion!;
        if (id == '')
            return [new InvalidArgumentMessage(arg.start, arg.end)];
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
