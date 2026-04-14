import { ParagraphNode } from "../interface";
import { BlockModifierDefinition, ModifierSlotType } from "../modifier";
import { onlyPermitSingleBlock, onlyPermitSimpleParagraphs } from "../modifier-helper";
import { BlockRendererDefiniton } from "../renderer";
import { HTMLRenderType } from "./html-renderer";

const quoteBlock = new BlockModifierDefinition(
    'quote', ModifierSlotType.Normal,
    { roleHint: 'quote' });

const epitaphBlock = new BlockModifierDefinition(
    'epitaph', ModifierSlotType.Normal,
    { roleHint: 'quote' });

const calloutBlock = new BlockModifierDefinition(
    'callout', ModifierSlotType.Normal,
    { roleHint: 'quote' });

const detailBlock = new BlockModifierDefinition(
    'detail', ModifierSlotType.Normal,
    { roleHint: 'quote' });

const attributionBlock = new BlockModifierDefinition<boolean>(
    'by', ModifierSlotType.Normal,
    {
        roleHint: 'quote',
        prepareExpand(node) {
            let msgs = onlyPermitSingleBlock(node);
            if (msgs) return msgs;
            msgs = onlyPermitSimpleParagraphs(node);
            if (msgs) return msgs;
            node.state = true;
            return [];
        },
    });

export const QuoteBlocks = [quoteBlock, epitaphBlock, calloutBlock, detailBlock, attributionBlock];

export const QuoteBlockRenderersHTML = [
    [quoteBlock, async (node, cxt) =>
        <blockquote data-id={cxt.state.addSourceMap(node.location)}>
            {await cxt.state.render(node.content, cxt)}
        </blockquote>
    ] satisfies BlockRendererDefiniton<HTMLRenderType>,
    [epitaphBlock, async (node, cxt) =>
        <blockquote class='epitaph' data-id={cxt.state.addSourceMap(node.location)}>
            {await cxt.state.render(node.content, cxt)}
        </blockquote>
    ] satisfies BlockRendererDefiniton<HTMLRenderType>,
    [detailBlock, async (node, cxt) =>
        <div class='detail' data-id={cxt.state.addSourceMap(node.location)}>
            {await cxt.state.render(node.content, cxt)}
        </div>
    ] satisfies BlockRendererDefiniton<HTMLRenderType>,
    [calloutBlock, async (node, cxt) =>
        <aside data-id={cxt.state.addSourceMap(node.location)}>
            {await cxt.state.render(node.content, cxt)}
        </aside>
    ] satisfies BlockRendererDefiniton<HTMLRenderType>,
    [attributionBlock, async (node, cxt) => {
        if (!node.state)
            return cxt.state.invalidBlock(node, 'bad format', cxt);
        let para = node.content[0] as ParagraphNode;
        return <p class='attribution' data-id={cxt.state.addSourceMap(para.location)}>
            {await cxt.state.render(para.content, cxt)}
        </p>;
    }] satisfies BlockRendererDefiniton<HTMLRenderType, boolean>
];
