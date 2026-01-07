import { InlineModifierDefinition, ModifierSlotType } from "../modifier";
import { InlineRendererDefiniton } from "../renderer";
import { HTMLRenderType } from "./html-renderer";

const emphasisInline = new InlineModifierDefinition(
    'emphasis', ModifierSlotType.Normal,
    { roleHint: 'emphasis' });

const keywordInline = new InlineModifierDefinition(
    'keyword', ModifierSlotType.Normal,
    { roleHint: 'keyword' });

const highlightInline = new InlineModifierDefinition(
    'highlight', ModifierSlotType.Normal,
    { roleHint: 'highlight' });

const commentaryInline = new InlineModifierDefinition(
    'commentary', ModifierSlotType.Normal,
    { roleHint: 'commentary' });

const sequenceInline = new InlineModifierDefinition(
    'seq', ModifierSlotType.Normal,
    { roleHint: 'pre' });

export const InlineStyles = [emphasisInline, keywordInline, highlightInline, commentaryInline, sequenceInline];

export const InlineStyleRenderersHTML = [
    [emphasisInline, async (node, cxt) =>
        <em>{await cxt.state.render(node.content, cxt)}</em>
    ] satisfies InlineRendererDefiniton<HTMLRenderType>,
    [keywordInline, async (node, cxt) =>
        <b>{await cxt.state.render(node.content, cxt)}</b>
    ] satisfies InlineRendererDefiniton<HTMLRenderType>,
    [highlightInline, async (node, cxt) =>
        <mark>{await cxt.state.render(node.content, cxt)}</mark>
    ] satisfies InlineRendererDefiniton<HTMLRenderType>,
    [commentaryInline, async (node, cxt) =>
        <span class='commentary'>{await cxt.state.render(node.content, cxt)}</span>
    ] satisfies InlineRendererDefiniton<HTMLRenderType>,
    [sequenceInline, async (node, cxt) =>
        <span class='seq'>{await cxt.state.render(node.content, cxt)}</span>
    ] satisfies InlineRendererDefiniton<HTMLRenderType>
];
