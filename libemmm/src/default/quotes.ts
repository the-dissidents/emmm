import { BlockModifierDefinition, BlockRendererDefiniton, ModifierFlags } from "../interface";
import { HTMLRenderType } from "./html-renderer";

const quoteBlock = new BlockModifierDefinition(
    'quote', ModifierFlags.Normal,
    { roleHint: 'quote' });

const epitaphBlock = new BlockModifierDefinition(
    'epitaph', ModifierFlags.Normal,
    { roleHint: 'quote' });

const attributionBlock = new BlockModifierDefinition(
    'by', ModifierFlags.Normal,
    { roleHint: 'quote' });

export const QuoteBlocks = [quoteBlock, epitaphBlock, attributionBlock];

export const QuoteBlockRenderersHTML = [
    [quoteBlock, (node, cxt) => {
        return `<blockquote>${cxt.state.render(node.content, cxt)}</blockquote>`
    }] satisfies BlockRendererDefiniton<HTMLRenderType>,
    [epitaphBlock, (node, cxt) => {
        return `<blockquote class='epitaph'>${cxt.state.render(node.content, cxt)}</blockquote>`;
    }] satisfies BlockRendererDefiniton<HTMLRenderType>,
    [attributionBlock, (node, cxt) => {
        return `<p class='attribution'>${cxt.state.render(node.content, cxt)}</p>`;
    }] satisfies BlockRendererDefiniton<HTMLRenderType>
];