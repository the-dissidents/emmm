import { debug } from "../debug";
import { ModifierNode } from "../interface";
import { BlockModifierDefinition, ModifierSlotType, SystemModifierDefinition } from "../modifier";
import { CannotUseModuleInSelfMessage, InvalidArgumentMessage, NoNestedModuleMessage, OverwriteDefinitionsMessage } from "../messages";
import { bindArgs } from "../modifier-helper";
import { ModuleDefinition } from "../module";
import { ParseContext } from "../parser-config";
import { builtins } from "./internal";

export const ModuleMod =
    new BlockModifierDefinition<{
        name: string,
        defs: ModuleDefinition
    }>('module', ModifierSlotType.Normal,
{
    expand() {
        // no need to clone?
        return []; // node.content;
    },
    beforeParseContent(node, cxt) {
        let { msgs, args } = bindArgs(node, ['name']);
        if (msgs) return msgs;

        const data = cxt.get(builtins)!;
        const name = args!.name;
        const defs = ModuleDefinition.from(cxt);

        if (data.insideModule !== undefined)
            return [new NoNestedModuleMessage(node.head)];

        msgs = [];
        node.state = { name, defs };
        data.insideModule = name;
        if (cxt.config.modules.has(name)) {
            const [combined, msg] = ModuleDefinition.combine(defs, cxt.config.modules.get(name)!);
            if (msg) msgs.push(
                new OverwriteDefinitionsMessage(node.head, msg));
            ModuleDefinition.apply(combined, cxt);
            debug.trace('entering defs for module', name, '(earlier data loaded)');
        } else {
            debug.trace('entering defs for module', name);
        }
        return msgs;
    },
    afterParseContent(node, cxt) {
        if (!node.state) return [];
        const data = cxt.get(builtins)!;
        data.insideModule = undefined;

        const old = ModuleDefinition.from(cxt);
        cxt.config.modules.set(node.state.name,
            ModuleDefinition.diff(old, node.state.defs));
        ModuleDefinition.apply(node.state.defs, cxt);
        debug.trace('exiting defs for module', node.state.name);
        return [];
    },
});

function use(node: ModifierNode<ModuleDefinition>, cxt: ParseContext) {
    let { msgs, args, nodes } = bindArgs(node, ['name']);
    if (msgs) return msgs;

    const data = cxt.get(builtins)!;
    if (!cxt.config.modules.has(args!.name))
        return [new InvalidArgumentMessage(nodes!.name.location)];
    if (data.insideModule === args!.name)
        return [new CannotUseModuleInSelfMessage(nodes!.name.location)];

    const old = ModuleDefinition.from(cxt);
    const [combined, msg] = ModuleDefinition.combine(cxt.config.modules.get(args!.name)!, old);
    ModuleDefinition.apply(combined, cxt)
    node.state = old;

    if (msg)
        return [new OverwriteDefinitionsMessage(node.head, msg)];
    return [];
}

export const UseSystemMod =
    new SystemModifierDefinition<ModuleDefinition>('use', ModifierSlotType.None,
{
    prepareExpand(node, cxt) {
        return use(node, cxt);
    },
});

export const UseBlockMod =
    new BlockModifierDefinition<ModuleDefinition>('use', ModifierSlotType.Normal,
{
    beforeParseContent(node, cxt) {
        return use(node, cxt);
    },
    afterParseContent(node, cxt) {
        if (node.state)
            ModuleDefinition.apply(node.state, cxt);
        return [];
    },
    expand(node) {
        return node.content;
    },
});
