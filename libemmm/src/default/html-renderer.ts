import { debug } from "../debug";
import { BlockEntity, InlineEntity, NodeType, ReadonlyRenderConfiguration, RenderConfiguration, RenderContext } from "../interface";
import { BulletBlockRenderersHTML } from "./bullets";
import { CodeBlockRendererHTML, CodeInlineRendererHTML } from "./code";
import { HeadingBlockRenderersHTML } from "./headings";
import { MiscInlineRenderersHTML } from "./misc";
import { QuoteBlockRenderersHTML } from "./quotes";

export type HTMLRenderType = {
    state: HTMLRenderState,
    return: string
}; 

export class HTMLRenderState {
    title: string = '';
    stylesheet = ''; // FIXME: very unsafe!

    // https://stackoverflow.com/questions/7381974
    escape(content: string) {
        return content
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#39;");
    }

    invalidBlock(node: BlockEntity, msg: string) {
        let name = NodeType[node.type];
        if (node.type === NodeType.BlockModifier)
            name += ` (${node.mod.name})`;
        // TODO: include details
        return `<div class='invalid'>Invalid ${this.escape(name)}<br><i>${this.escape(msg)}</i></div>`
    }

    invalidInline(node: InlineEntity, msg: string) {
        let name = NodeType[node.type];
        if (node.type === NodeType.InlineModifier)
            name += ` (${node.mod.name})`;
        // TODO: include details
        return `<span class='invalid'>Invalid ${this.escape(name)}<br><i>${this.escape(msg)}</i></span>`
    }

    render(elems: (BlockEntity | InlineEntity)[], cxt: RenderContext<HTMLRenderType>) {
        return elems.map((x) => cxt.renderEntity(x)).filter((x) => x !== undefined).join('');
    }
}

const htmlConfig = new RenderConfiguration<HTMLRenderType>(
    (results, cxt) => 
`<!DOCTYPE html>
<html>
<head>
<title>${cxt.state.escape(cxt.state.title)}</title>`+`
<style>${cxt.state.stylesheet}</style>`+`
</head>
<body>
${results.join('\n')}
</body>
</html>`);

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
    ...MiscInlineRenderersHTML
)

export const HTMLRenderConfiguration
    : ReadonlyRenderConfiguration<HTMLRenderType> = htmlConfig;