import { debugPrint } from "./debug-print";
import { InlineShorthand, BlockShorthand } from "./parser-config";
import { BlockModifierDefinition, InlineModifierDefinition } from "./modifier";
import { ParseContext } from "./parser-config";
import { NameManager } from "./util";

export type ModuleDefinition = {
    usedModules: Set<string>;
    blocks: Set<BlockModifierDefinition<unknown>>;
    inlines: Set<InlineModifierDefinition<unknown>>;
    inlineShorthands: Set<InlineShorthand<unknown>>;
    blockShorthands: Set<BlockShorthand<unknown>>;
};

export namespace ModuleDefinition {
    export function from(cxt: ParseContext): ModuleDefinition {
        return {
            usedModules: new Set(cxt.usedModules),
            blocks: cxt.config.blockModifiers.toSet(),
            inlines: cxt.config.inlineModifiers.toSet(),
            inlineShorthands: cxt.config.inlineShorthands.toSet(),
            blockShorthands: cxt.config.blockShorthands.toSet()
        };
    }

    export function apply(defs: ModuleDefinition, cxt: ParseContext) {
        cxt.usedModules = new Set(defs.usedModules);
        cxt.config.blockModifiers = new NameManager(defs.blocks);
        cxt.config.inlineModifiers = new NameManager(defs.inlines);
        cxt.config.inlineShorthands = new NameManager(defs.inlineShorthands);
        cxt.config.blockShorthands = new NameManager(defs.blockShorthands);
    }

    export function diff(cnew: ModuleDefinition, cold: ModuleDefinition): ModuleDefinition {
        return {
            usedModules: cnew.usedModules.difference(cold.usedModules),
            blocks: cnew.blocks.difference(cold.blocks),
            inlines: cnew.inlines.difference(cold.inlines),
            inlineShorthands: cnew.inlineShorthands.difference(cold.inlineShorthands),
            blockShorthands: cnew.blockShorthands.difference(cold.blockShorthands)
        };
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

    export function combine(
        cnew: ModuleDefinition, cold: ModuleDefinition
    ): [ModuleDefinition, string] {
        let [blocks, s1] =
            add(cnew.blocks, cold.blocks, debugPrint.blockModifier);
        let [inlines, s2] =
            add(cnew.inlines, cold.inlines, debugPrint.inlineModifier);
        let [inlineShorthands, s3] =
            add(cnew.inlineShorthands, cold.inlineShorthands, debugPrint.inlineShorthand);
        let [blockShorthands, s4] =
            add(cnew.blockShorthands, cold.blockShorthands, debugPrint.blockShorthand);
        return [
            {
                usedModules: cnew.usedModules.union(cold.usedModules),
                blocks, inlines, inlineShorthands, blockShorthands
            },
            (s1 ? s1 + '; ' : '')
        + (s2 ? s2 + '; ' : '')
        + (s3 ? 'inline shorthand ' + s3 + '; ' : '')
        + (s4 ? 'block shorthand ' + s4 : '')
        ];
    }
}
