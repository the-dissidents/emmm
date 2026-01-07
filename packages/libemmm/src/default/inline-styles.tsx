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
    [emphasisInline, (node, cxt) =>
        <em>{cxt.state.render(node.content, cxt)}</em>
    ] satisfies InlineRendererDefiniton<HTMLRenderType>,
    [keywordInline, (node, cxt) =>
        <b>{cxt.state.render(node.content, cxt)}</b>
    ] satisfies InlineRendererDefiniton<HTMLRenderType>,
    [highlightInline, (node, cxt) =>
        <mark>{cxt.state.render(node.content, cxt)}</mark>
    ] satisfies InlineRendererDefiniton<HTMLRenderType>,
    [commentaryInline, (node, cxt) =>
        <span class='commentary'>{cxt.state.render(node.content, cxt)}</span>
    ] satisfies InlineRendererDefiniton<HTMLRenderType>,
    [sequenceInline, (node, cxt) =>
        <span class='seq'>{cxt.state.render(node.content, cxt)}</span>
    ] satisfies InlineRendererDefiniton<HTMLRenderType>
];
