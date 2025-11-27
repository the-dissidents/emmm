import { debug } from "../debug";
import { InlineModifierDefinition, ModifierSlotType, ArgumentInterpolatorDefinition, SystemModifierDefinition, NodeType, BlockModifierDefinition, ModifierNode } from "../interface";
import { CannotExpandArgumentMessage, InvalidArgumentMessage, UndefinedVariableMessage } from "../messages";
import { builtins } from "./internal";
import { ParseContext } from "../parser-config";
import { bindArgs } from "../modifier-helper";

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

let ifdefBody = (x: boolean) => ({
    prepareExpand(node: ModifierNode, cxt: ParseContext) {
        let { msgs, args, nodes } = bindArgs(node, ['id']);
        if (msgs) return msgs;
        if (args!.id == '') return [new InvalidArgumentMessage(nodes!.id.location)];
        const value = resolveId(args!.id, cxt);
        node.state = value !== undefined;
        return [];
    },
    expand(node: any) {
        return (node.state == x) ? node.content : [];
    }
});

let ifdefBlock = (name: string, x: boolean) =>
    new BlockModifierDefinition<boolean>
    (name, ModifierSlotType.Normal, ifdefBody(x));

let ifdefInline = (name: string, x: boolean) =>
    new InlineModifierDefinition<boolean>
    (name, ModifierSlotType.Normal, ifdefBody(x));

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
        let { msgs, args, nodes } = bindArgs(node, ['id']);
        if (msgs) return immediate ? msgs : [];

        const id = args!.id;
        if (id == '')
            return immediate ? [new InvalidArgumentMessage(nodes!.id.location)] : [];

        const value = resolveId(id, cxt);
        if (value === undefined)
            return immediate ? [new UndefinedVariableMessage(nodes!.id.location, id)] : [];
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
        let { msgs, rest } = bindArgs(node, [], { rest: true });
        if (msgs) return msgs;
        node.state = { value: rest!.join('') };
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
    prepareExpand(node) {
        if (node.arguments.named.size == 1 && node.arguments.positional.length == 0) {
            const [id, arg] = [...node.arguments.named][0];
            if (arg.expansion === undefined)
                return [new CannotExpandArgumentMessage(arg.location)];

            node.state = { id, value: arg.expansion };
            return [];
        }

        let { msgs, args, nodes } = bindArgs(node, ['id', 'value']);
        if (msgs) return msgs;

        if (!args!.id)
            return [new InvalidArgumentMessage(nodes!.id.location)];

        node.state = {
            id: args!.id,
            value: args!.value
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
