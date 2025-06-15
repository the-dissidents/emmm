import { ModifierSlotType, InlineModifierDefinition, BlockModifierDefinition, ParagraphNode } from "../interface";
import { checkArguments, onlyPermitSimpleParagraphs, onlyPermitSingleBlock } from "../modifier-helper";
import { BlockRendererDefiniton, InlineRendererDefiniton } from "../renderer";
import { HTMLRenderType } from "./html-renderer";

const rubyInline = new InlineModifierDefinition<string>(
    'ruby', ModifierSlotType.Normal,
    {
        roleHint: undefined,
        prepareExpand(node) {
            let msgs = checkArguments(node, 1);
            if (msgs) return msgs;
            node.state = node.arguments[0].expansion!;
            return [];
        },
    });

const linkInline = new InlineModifierDefinition<string>(
    'link', ModifierSlotType.Normal,
    {
        roleHint: 'link',
        prepareExpand(node) {
            let msgs = checkArguments(node, 1);
            if (msgs) return msgs;
            node.state = node.arguments[0].expansion!;
            return [];
        },
    });

const styleBlock = new BlockModifierDefinition<string>(
    'style', ModifierSlotType.Normal,
    {
        prepareExpand(node) {
            let msgs = checkArguments(node, 1);
            if (msgs) return msgs;
            node.state = node.arguments[0].expansion!;
            return [];
        },
    });

const breakBlock = new BlockModifierDefinition<string>(
    'break', ModifierSlotType.None);

const linkBlock = new BlockModifierDefinition<string>(
    'link', ModifierSlotType.Normal,
    {
        roleHint: 'link',
        prepareExpand(node) {
            let msgs = checkArguments(node, 1);
            if (msgs) return msgs;
            node.state = node.arguments[0].expansion!;
            return [];
        },
    });

const imageBlock = new BlockModifierDefinition<string>(
    'image', ModifierSlotType.Normal,
    {
        roleHint: 'link',
        prepareExpand(node) {
            let msgs = checkArguments(node, 1, 2);
            if (msgs) return msgs;
            msgs = onlyPermitSingleBlock(node);
            if (msgs) return msgs;
            msgs = onlyPermitSimpleParagraphs(node);
            if (msgs) return msgs;
            // TODO: not very good!
            node.state = node.arguments.map((x) => x.expansion!).join(':');
            return [];
        },
    });

export const MiscInlines = [rubyInline, linkInline];

export const MiscBlocks = [styleBlock, breakBlock, linkBlock, imageBlock];

export const MiscInlineRenderersHTML = [
    [rubyInline, (node, cxt) => {
        if (node.state === undefined)
            return cxt.state.invalidInline(node, 'bad format');
        return `<ruby>${cxt.state.render(node.content, cxt)}<rt>${node.state}</rt></ruby>`
    }] satisfies InlineRendererDefiniton<HTMLRenderType, string>,
    [linkInline, (node, cxt) => {
        if (node.state === undefined)
            return cxt.state.invalidInline(node, 'bad format');
        return `<a href="${encodeURI(node.state)}">${cxt.state.render(node.content, cxt)}</a>`;
    }] satisfies InlineRendererDefiniton<HTMLRenderType, string>,
];

export const MiscBlockRenderersHTML = [
    [styleBlock, (node, cxt) => {
        if (node.state === undefined)
            return cxt.state.invalidBlock(node, 'bad format');
        return `<div class="emmmstyle-${node.state}" style="display:contents">${cxt.state.render(node.content, cxt)}</div>`;
    }] satisfies BlockRendererDefiniton<HTMLRenderType, string>,
    [breakBlock, () => {
        return `<hr>`;
    }] satisfies BlockRendererDefiniton<HTMLRenderType>,
    [linkBlock, (node, cxt) => {
        if (node.state === undefined)
            return cxt.state.invalidBlock(node, 'bad format');
        return `<a href="${encodeURI(node.state)}">${cxt.state.render(node.content, cxt)}</a>`;
    }] satisfies BlockRendererDefiniton<HTMLRenderType, string>,
    [imageBlock, (node, cxt) => {
        if (node.state === undefined)
            return cxt.state.invalidBlock(node, 'bad format');
        let transformed: string | undefined;
        try {
            transformed = cxt.config.options.transformAsset(node.state);
        } catch {
            return cxt.state.invalidBlock(node, 'unable to transform asset');
        }
        const img = transformed 
            ? `<img src="${transformed}" data-original-src="${node.state}"/>`
            : `<img src="${node.state}"/>`;
        const para = node.content.length == 0 
            ? '' 
            : '\n<figcaption>'
                + cxt.state.render((node.content[0] as ParagraphNode).content, cxt)
                + '</figcaption>';
        return `<figure>${img}${para}</figure>`;
    }] satisfies BlockRendererDefiniton<HTMLRenderType, string>
];