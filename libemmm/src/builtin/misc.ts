import { BlockModifierDefinition, ModifierSlotType } from "../interface";

export const RawBlockMod = new BlockModifierDefinition
    ('raw', ModifierSlotType.Preformatted,
{
    expand(node) {
        return node.content;
    },
});