import { InlineModifierDefinition, ModifierSlotType } from "../interface";
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

export const InlineStyles = [emphasisInline, keywordInline, highlightInline, commentaryInline];

export const InlineStyleRenderersHTML = [
    [emphasisInline, (node, cxt) => {
        return `<em>${cxt.state.render(node.content, cxt)}</em>`
    }] satisfies InlineRendererDefiniton<HTMLRenderType>,
    [keywordInline, (node, cxt) => {
        return `<b>${cxt.state.render(node.content, cxt)}</b>`;
    }] satisfies InlineRendererDefiniton<HTMLRenderType>,
    [highlightInline, (node, cxt) => {
        return `<mark>${cxt.state.render(node.content, cxt)}</mark>`;
    }] satisfies InlineRendererDefiniton<HTMLRenderType>,
    [commentaryInline, (node, cxt) => {
        return `<span class='commentary'>${cxt.state.render(node.content, cxt)}</span>`;
    }] satisfies InlineRendererDefiniton<HTMLRenderType>
];