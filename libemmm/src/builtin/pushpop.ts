import { ModifierFlags, SystemModifierDefinition } from "../interface";
import { CannotPopNotationMessage } from "../messages";
import { NameManager } from "../util";
import { builtins } from "./internal";

export const PushNotationMod = 
    new SystemModifierDefinition('push-notation', ModifierFlags.Marker, 
{
    expand(_, cxt) {
        const data = cxt.get(builtins)!;
        data.notationStack.push({
            blocks: cxt.config.blockModifiers.toArray(),
            inlines: cxt.config.inlineModifiers.toArray(),
            inlineShorthands: cxt.config.inlineShorthands.toArray(),
            blockShorthands: cxt.config.blockShorthands.toArray()
        })
        return [];
    },
});

export const PopNotationMod = 
    new SystemModifierDefinition('pop-notation', ModifierFlags.Marker, 
{
    prepareExpand(node, cxt) {
        const data = cxt.get(builtins)!;
        const result = data.notationStack.pop();
        if (!result) return [
            new CannotPopNotationMessage(node.start, node.end)];
        cxt.config.blockModifiers = new NameManager(result.blocks);
        cxt.config.inlineModifiers = new NameManager(result.inlines);
        cxt.config.inlineShorthands = new NameManager(result.inlineShorthands);
        cxt.config.blockShorthands = new NameManager(result.blockShorthands);
        return [];
    },
    expand() {
        return [];
    },
});
