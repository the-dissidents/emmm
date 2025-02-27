import { debug } from "../debug";
import { BlockEntity, InlineEntity, NodeType } from "../interface";
import { RenderContext, RenderConfiguration, ReadonlyRenderConfiguration } from "../renderer";
import { BulletBlockRenderersHTML } from "./bullets";
import { CodeBlockRendererHTML, CodeInlineRendererHTML } from "./code";
import { HeadingBlockRenderersHTML } from "./headings";
import { InlineStyleRenderersHTML } from "./inline-styles";
import { MiscInlineRenderersHTML } from "./misc";
import { NoteInlineRenderersHTML, NotesFooterPlugin } from "./notes";
import { QuoteBlockRenderersHTML } from "./quotes";

export type HTMLRendererOptions = {
    headPlugins: HTMLComponentPlugin[];
    headerPlugins: HTMLComponentPlugin[];
    footerPlugins: HTMLComponentPlugin[];
    // postprocessPlugins: HTMLPostprocessPlugin[];
}

export type HTMLRenderType = {
    state: HTMLRenderState,
    options: HTMLRendererOptions,
    return: string,
};

export type HTMLRenderPlugin = 
    (elem: BlockEntity | InlineEntity, cxt: RenderContext<HTMLRenderType>) => string | undefined;

export type HTMLComponentPlugin = 
    (cxt: RenderContext<HTMLRenderType>) => string | undefined;

export type HTMLPostprocessPlugin = 
    (cxt: RenderContext<HTMLRenderType>, output: string) => string;

export class HTMLRenderState {
    title: string = '';
    stylesheet = ''; // FIXME: very unsafe!
    cssVariables = new Map<string, string>;

    // https://stackoverflow.com/questions/7381974
    escape(content: string) {
        return content
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#39;")
            .replaceAll('\n', '<br/>');
    }

    invalidBlock(node: BlockEntity, msg: string) {
        let name = NodeType[node.type];
        if (node.type === NodeType.BlockModifier)
            name += ` (${node.mod.name})`;
        // TODO: include details
        return `<details class='invalid'><summary>Invalid ${this.escape(name)}</summary><i>${this.escape(msg)}</i></details>`
    }

    invalidInline(node: InlineEntity, msg: string) {
        let name = NodeType[node.type];
        if (node.type === NodeType.InlineModifier)
            name += ` (${node.mod.name})`;
        // TODO: include details
        return `<span class='invalid'>Invalid ${this.escape(name)} – <i>${this.escape(msg)}</i></span>`
    }

    render(elems: (BlockEntity | InlineEntity)[], cxt: RenderContext<HTMLRenderType>) {
        return elems.map((x) => cxt.renderEntity(x)).filter((x) => x !== undefined).join('');
    }
}

const htmlConfig = new RenderConfiguration<HTMLRenderType>(
    {
        headPlugins: [],
        headerPlugins: [],
        footerPlugins: [NotesFooterPlugin],
        // postprocessPlugins: []
    },
    (results, cxt) => {
        // TODO: seriously...
        let styles = cxt.state.stylesheet.replaceAll(/var\(--(.*?)\)/g, 
            (m, c) => cxt.state.cssVariables.get(c) ?? m)
        return `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>${cxt.state.escape(cxt.state.title)}</title>
<style>${styles}</style>
${cxt.config.options.headPlugins
    .map((x) => x(cxt))
    .filter((x) => x !== undefined)
    .join('\n')}
</head>
<body>
<section class="article-container">
<section class="article-body">
${cxt.config.options.headerPlugins
    .map((x) => x(cxt))
    .filter((x) => x !== undefined)
    .join('\n')}
${results.join('\n')}
${cxt.config.options.footerPlugins
    .map((x) => x(cxt))
    .filter((x) => x !== undefined)
    .join('\n')}
</section>
</section>
</body>
</html>`
});

htmlConfig.paragraphRenderer = (node, cxt) => 
    `<p>${node.content
        .map((x) => cxt.renderEntity(x))
        .filter((x) => x !== undefined).join('')}</p>`;

htmlConfig.textRenderer = (node, cxt) => {
    switch (node.type) {
        case NodeType.Preformatted:
            return cxt.state.escape(node.content.text);
        case NodeType.Text:
        case NodeType.Escaped:
            return cxt.state.escape(node.content);
        default:
            return debug.never(node);
    }
}

htmlConfig.undefinedBlockRenderer = (node, cxt) => {
    return cxt.state.invalidBlock(node, `No renderer defined for ${node.mod.name}`);
}

htmlConfig.undefinedInlineRenderer = (node, cxt) => {
    return cxt.state.invalidInline(node, `No renderer defined for ${node.mod.name}`);
}

htmlConfig.addBlockRenderer(
    ...HeadingBlockRenderersHTML, 
    ...BulletBlockRenderersHTML,
    CodeBlockRendererHTML,
    ...QuoteBlockRenderersHTML,
    // TODO: notes
);

htmlConfig.addInlineRenderer(
    CodeInlineRendererHTML,
    ...InlineStyleRenderersHTML,
    ...MiscInlineRenderersHTML,
    ...NoteInlineRenderersHTML
)

export const HTMLRenderConfiguration
    : ReadonlyRenderConfiguration<HTMLRenderType> = htmlConfig;