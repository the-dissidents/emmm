import { BlockShorthand, BlockModifierDefinition, ModifierFlags, InlineModifierDefinition } from "../interface";
import { checkArguments } from "../modifier-helper";

export const CommentShorthand: BlockShorthand<{}> = {
    name: '//',
    parts: [],
    postfix: undefined,
    mod: new BlockModifierDefinition('<shorthand>', ModifierFlags.Preformatted, {
        alwaysTryExpand: true,
        roleHint: 'comment',
        expand: () => [],
    })
};

export const HeadingBlock = new BlockModifierDefinition(
    'heading', ModifierFlags.Normal,
    { roleHint: 'heading' });

export const NumberedHeadingBlock = new BlockModifierDefinition(
    'numbered-heading', ModifierFlags.Normal,
    {
        roleHint: 'heading',
        prepareExpand(node) {
            return checkArguments(node, 1) ?? [];
        },
    });

export const BulletItemBlock = new BlockModifierDefinition(
    'bullet-item', ModifierFlags.Normal,
    { roleHint: undefined });

export const OrderedListItemBlock = new BlockModifierDefinition(
    'ordered-item', ModifierFlags.Normal,
    {
        roleHint: undefined,
        prepareExpand(node) {
            return checkArguments(node, 1) ?? [];
        },
    });

export const SubItemBlock = new BlockModifierDefinition(
    'subitem', ModifierFlags.Normal,
    {
        roleHint: undefined,
        prepareExpand(node) {
            return checkArguments(node, 1) ?? [];
        },
    });

export const CodeBlock = new BlockModifierDefinition(
    'code', ModifierFlags.Preformatted,
    { roleHint: 'code' });

export const CodeInline = new InlineModifierDefinition(
    'code', ModifierFlags.Preformatted,
    { roleHint: 'code' });


export const EmphasisInline = new InlineModifierDefinition(
    'emphasis', ModifierFlags.Normal,
    { roleHint: 'emphasis' });

export const KeywordInline = new InlineModifierDefinition(
    'keyword', ModifierFlags.Normal,
    { roleHint: 'keyword' });

export const HighlightInline = new InlineModifierDefinition(
    'highlight', ModifierFlags.Normal,
    { roleHint: 'highlight' });

export const CommentaryInline = new InlineModifierDefinition(
    'commentary', ModifierFlags.Normal,
    { roleHint: 'commentary' });

export const RubyInline = new InlineModifierDefinition(
    'ruby', ModifierFlags.Normal,
    {
        roleHint: undefined,
        prepareExpand(node) {
            return checkArguments(node, 1) ?? [];
        },
    });

export const LinkInline = new InlineModifierDefinition(
    'link', ModifierFlags.Normal,
    {
        roleHint: 'link',
        prepareExpand(node) {
            return checkArguments(node, 1) ?? [];
        },
    });

export const QuoteBlock = new BlockModifierDefinition(
    'quote', ModifierFlags.Normal,
    { roleHint: 'quote' });

export const EpitaphBlock = new BlockModifierDefinition(
    'epitaph', ModifierFlags.Normal,
    { roleHint: 'quote' });

export const AttributionBlock = new BlockModifierDefinition(
    'by', ModifierFlags.Normal,
    { roleHint: 'quote' });

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
    });

export const NoteBlock = new BlockModifierDefinition(
    'note', ModifierFlags.Normal,
    {
        roleHint: 'quote',
        prepareExpand(node) {
            return checkArguments(node, 1) ?? [];
        },
    });