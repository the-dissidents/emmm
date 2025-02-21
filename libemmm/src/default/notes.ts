import { InlineModifierDefinition, ModifierFlags, BlockModifierDefinition } from "../interface";
import { checkArguments } from "../modifier-helper";

export const NoteMarkerInline = new InlineModifierDefinition(
    'note', ModifierFlags.Marker,
    {
        roleHint: 'link',
        prepareExpand(node) {
            return checkArguments(node, 1) ?? [];
        },
    });

export const NoteInline = new InlineModifierDefinition(
    'note-inline', ModifierFlags.Normal,
    {
        roleHint: 'quote',
        prepareExpand(node) {
            return checkArguments(node, 1) ?? [];
        },
        // TODO: put expanded content in a context state, together with position
    });

export const NoteBlock = new BlockModifierDefinition(
    'note', ModifierFlags.Normal,
    {
        roleHint: 'quote',
        prepareExpand(node) {
            return checkArguments(node, 1) ?? [];
        },
        // TODO: put expanded content in a context state, together with position
    });