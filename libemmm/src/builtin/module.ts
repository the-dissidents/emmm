import { debug } from "../debug";
import { debugPrint } from "../debug-print";
import { BlockModifierDefinition, BlockShorthand, Configuration, InlineModifierDefinition, InlineShorthand, Message, ModifierFlags, ParseContext, SystemModifierDefinition } from "../interface";
import { CannotUseModuleInSelfMessage, InvalidArgumentMessage, NoNestedModuleMessage, OverwriteDefinitionsMessage } from "../messages";
import { checkArguments } from "../modifier-helper";
import { has, NameManager } from "../util";
import { builtins } from "./internal";

export type ConfigDefinitions = {
    usedModules: Set<string>;
    blocks: Set<BlockModifierDefinition<unknown>>;
    inlines: Set<InlineModifierDefinition<unknown>>;
    inlineShorthands: Set<InlineShorthand<unknown>>;
    blockShorthands: Set<BlockShorthand<unknown>>;
}

function getDefs(cxt: ParseContext): ConfigDefinitions {
    const data = cxt.get(builtins)!;
    return {
        usedModules: new Set(data.usedModules),
        blocks: cxt.config.blockModifiers.toSet(),
        inlines: cxt.config.inlineModifiers.toSet(),
        inlineShorthands: cxt.config.inlineShorthands.toSet(),
        blockShorthands: cxt.config.blockShorthands.toSet()
    };
}

function applyDefs(cxt: ParseContext, defs: ConfigDefinitions) {
    const data = cxt.get(builtins)!;
    data.usedModules = new Set(defs.usedModules);
    cxt.config.blockModifiers = new NameManager(defs.blocks);
    cxt.config.inlineModifiers = new NameManager(defs.inlines);
    cxt.config.inlineShorthands = new NameManager(defs.inlineShorthands);
    cxt.config.blockShorthands = new NameManager(defs.blockShorthands);
}

function add<T extends {name: string}>(
    snew: ReadonlySet<T>, sold: ReadonlySet<T>, transform: (x: T) => string
): [Set<T>, string] {
    let newNames = new Set<string>([...snew].map((x) => x.name));
    let out = new Set<T>(snew);
    let overlap: T[] = [];
    for (const x of sold) {
        if (newNames.has(x.name))
            overlap.push(x);
        else
            out.add(x);
    }
    return [out, overlap.map(transform).join(', ')];
}

function diffDef(cnew: ConfigDefinitions, cold: ConfigDefinitions): ConfigDefinitions {
    return {
        usedModules: cnew.usedModules.difference(cold.usedModules),
        blocks: cnew.blocks.difference(cold.blocks),
        inlines: cnew.inlines.difference(cold.inlines),
        inlineShorthands: cnew.inlineShorthands.difference(cold.inlineShorthands),
        blockShorthands: cnew.blockShorthands.difference(cold.blockShorthands)
    };
}

function addDef(cnew: ConfigDefinitions, cold: ConfigDefinitions): [ConfigDefinitions, string] {
    let [blocks, s1] = 
        add(cnew.blocks, cold.blocks, debugPrint.blockModifier);
    let [inlines, s2] =
        add(cnew.inlines, cold.inlines, debugPrint.inlineModifier);
    let [inlineShorthands, s3] = 
        add(cnew.inlineShorthands, cold.inlineShorthands, debugPrint.inlineShorthand);
    let [blockShorthands, s4] = 
        add(cnew.blockShorthands, cold.blockShorthands, debugPrint.blockShorthand);
    return [{
        usedModules: cnew.usedModules.union(cold.usedModules),
        blocks, inlines, inlineShorthands, blockShorthands
    },
        (s1 ? s1 + '; ' : '') 
      + (s2 ? s2 + '; ' : '') 
      + (s3 ? 'inline shorthand ' + s3 + '; ' : '')
      + (s4 ? 'block shorthand ' + s4 : '')];
}

export const ModuleMod = 
    new BlockModifierDefinition<{
        name: string,
        defs: ConfigDefinitions
    }>('module', ModifierFlags.Normal, 
{
    expand(node) {
        // no need to clone?
        return []; // node.content;
    },
    beforeParseContent(node, cxt) {
        const check = checkArguments(node, 1);
        if (check) return check;
        const data = cxt.get(builtins)!;
        const name = node.arguments[0].expansion!;
        const defs = getDefs(cxt);

        if (data.insideModule !== undefined) {
            return [new NoNestedModuleMessage(node.head.start, node.head.end)];
        }

        let msgs: Message[] = [];
        node.state = { name, defs };
        data.insideModule = name;
        if (data.modules.has(name)) {
            const [added, msg] = addDef(defs, data.modules.get(name)!);
            if (msg) msgs.push(
                new OverwriteDefinitionsMessage(node.head.start, node.head.end, msg));
            applyDefs(cxt, added);
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
        data.modules.set(node.state.name, 
            diffDef(getDefs(cxt), node.state.defs));
        applyDefs(cxt, node.state.defs);
        debug.trace('exiting defs for module', node.state.name);
        return [];
    },
});

export const UseSystemMod = 
    new SystemModifierDefinition<ConfigDefinitions>('use', ModifierFlags.Marker, 
{
    prepareExpand(node, cxt) {
        const check = checkArguments(node, 1);
        if (check) return check;
        const data = cxt.get(builtins)!;
        const name = node.arguments[0];
        if (!data.modules.has(name.expansion!))
            return [new InvalidArgumentMessage(name.start, name.end)];
        if (data.insideModule === name.expansion!)
            return [new CannotUseModuleInSelfMessage(name.start, name.end)];

        const [added, msg] = addDef(data.modules.get(name.expansion!)!, getDefs(cxt));
        node.state = added;

        if (msg) 
            return [new OverwriteDefinitionsMessage(node.head.start, node.head.end, msg)];
        return [];
    },
    expand(node, cxt) {
        if (node.state)
            applyDefs(cxt, node.state);
        return [];
    },
});

export const UseBlockMod = 
    new BlockModifierDefinition<{
        old: ConfigDefinitions
    }>('use', ModifierFlags.Normal, 
{
    beforeParseContent(node, cxt) {
        const check = checkArguments(node, 1);
        if (check) return check;
        const data = cxt.get(builtins)!;
        const name = node.arguments[0];
        if (!data.modules.has(name.expansion!))
            return [new InvalidArgumentMessage(name.start, name.end)];
        if (data.insideModule === name.expansion!)
            return [new CannotUseModuleInSelfMessage(name.start, name.end)];

        const old = getDefs(cxt);
        const [added, msg] = addDef(data.modules.get(name.expansion!)!, old);
        applyDefs(cxt, added);
        node.state = { old };

        if (msg) 
            return [new OverwriteDefinitionsMessage(node.head.start, node.head.end, msg)];
        return [];
    },
    afterParseContent(node, cxt) {
        if (node.state)
            applyDefs(cxt, node.state.old);
        return [];
    },
    expand(node) {
        return node.content;
    },
});