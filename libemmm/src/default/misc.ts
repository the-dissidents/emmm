import { BlockShorthand, BlockModifierDefinition, ModifierFlags, ModifierRole, InlineModifierDefinition } from "../interface";
import { checkArguments } from "../modifier-helper";

export const CommentShorthand: BlockShorthand<{}> = {
    name: '//',
    parts: [],
    postfix: undefined,
    mod: new BlockModifierDefinition('<shorthand>', ModifierFlags.Preformatted, {
        alwaysTryExpand: true,
        roleHint: ModifierRole.Comment,
        expand: () => [],
    })
};

export const HeadingBlock = new BlockModifierDefinition(
    'heading', ModifierFlags.Normal,
    { roleHint: ModifierRole.Heading });

export const NumberedHeadingBlock = new BlockModifierDefinition(
    'numbered-heading', ModifierFlags.Normal,
    {
        roleHint: ModifierRole.Heading,
        prepareExpand(node) {
            return checkArguments(node, 1) ?? [];
        },
    });

export const BulletItemBlock = new BlockModifierDefinition(
    'bullet-item', ModifierFlags.Normal,
    { roleHint: ModifierRole.Default });

export const OrderedListItemBlock = new BlockModifierDefinition(
    'ordered-item', ModifierFlags.Normal,
    {
        roleHint: ModifierRole.Default,
        prepareExpand(node) {
            return checkArguments(node, 1) ?? [];
        },
    });

export const SubItemBlock = new BlockModifierDefinition(
    'subitem', ModifierFlags.Normal,
    {
        roleHint: ModifierRole.Default,
        prepareExpand(node) {
            return checkArguments(node, 1) ?? [];
        },
    });

export const CodeBlock = new BlockModifierDefinition(
    'code', ModifierFlags.Preformatted,
    { roleHint: ModifierRole.Code });

export const CodeInline = new InlineModifierDefinition(
    'code', ModifierFlags.Preformatted,
    { roleHint: ModifierRole.Code });
