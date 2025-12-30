import { debug } from "../debug";
import { debugPrint } from "../debug-print";
import { BlockEntity, InlineEntity, NodeType } from "../interface";
import { RenderContext, RenderConfiguration, ReadonlyRenderConfiguration } from "../renderer";
import { stripNode } from "../node-util";
import { BulletBlockRenderersHTML } from "./bullets";
import { CodeBlockRendererHTML, CodeInlineRendererHTML } from "./code";
import { HeadingBlockRenderersHTML } from "./headings";
import { InlineStyleRenderersHTML } from "./inline-styles";
import { MiscBlockRenderersHTML, MiscInlineRenderersHTML } from "./misc";
import { NoteBlockRenderersHTML, NoteInlineRenderersHTML, NotesFooterPlugin } from "./notes";
import { QuoteBlockRenderersHTML } from "./quotes";
import { TableBlockRenderers, TableInlineRenderers } from "./table";
import { GalleryBlockRendererHTML } from "./gallery";

export type HTMLRendererOptions = {
    headPlugins: HTMLComponentPlugin[];
    headerPlugins: HTMLComponentPlugin[];
    footerPlugins: HTMLComponentPlugin[];
    postprocessPlugins: HTMLPostprocessPlugin[];
    transformAsset: (id: string) => string | undefined;
}

export type HTMLRenderType = {
    state: HTMLRenderState,
    options: HTMLRendererOptions,
    document: Document,
    return: Node | Node[],
};

export type HTMLRenderPlugin =
    (elem: BlockEntity | InlineEntity, cxt: RenderContext<HTMLRenderType>) => string | undefined;

export type HTMLComponentPlugin =
    (cxt: RenderContext<HTMLRenderType>) => Node | Node[] | undefined;

export type HTMLPostprocessPlugin =
    (cxt: RenderContext<HTMLRenderType>, output: Document) => void;

export class HTMLRenderState {
    title: string = '';
    stylesheet = ''; // FIXME: very unsafe!
    cssVariables = new Map<string, string>;

    invalidBlock(node: BlockEntity, msg: string) {
        let name = NodeType[node.type];
        if (node.type === NodeType.BlockModifier)
            name += ` (${node.mod.name})`;
        // TODO: include details
        return <details class='invalid'>
                <summary>Invalid {name}</summary>
                <i>{msg}</i>
                <pre>{debugPrint.node(node)}</pre>
               </details>;
    }

    invalidInline(node: InlineEntity, msg: string) {
        let name = NodeType[node.type];
        if (node.type === NodeType.InlineModifier)
            name += ` (${node.mod.name})`;
        // TODO: include details
        return <details class='invalid'>
                <summary>Invalid {name}</summary>
                <i>{msg}</i>
                <pre>{debugPrint.node(node)}</pre>
               </details>;
    }

    render(elems: (BlockEntity | InlineEntity)[], cxt: RenderContext<HTMLRenderType>) {
        let fragment = new DocumentFragment();
        elems
            .flatMap((x) => cxt.renderEntity(x))
            .flat()
            .forEach((x) => fragment.appendChild(x));
        return fragment;
    }
}

const htmlConfig =
    new RenderConfiguration<HTMLRenderType>(
{
    headPlugins: [],
    headerPlugins: [],
    footerPlugins: [NotesFooterPlugin],
    postprocessPlugins: [],
    transformAsset: () => undefined,
    // postprocessPlugins: [],
},
(results, cxt) => {
    // TODO: seriously...
    let styles = cxt.state.stylesheet.replaceAll(/var\(--(.*?)\)/g,
        (m, c) => cxt.state.cssVariables.get(c) ?? m);
    let doc = document.implementation.createHTMLDocument(cxt.state.title);
    doc.head.append(
        <meta charset="UTF-8" />,
        <style>{styles}</style>,
        ...cxt.config.options.headPlugins
            .map((x) => x(cxt))
            .filter((x) => x !== undefined)
            .flat()
    );
    doc.body.append(
        <section class="article-container">
        <section class="article-body">
        {cxt.config.options.headerPlugins
            .map((x) => x(cxt))
            .filter((x) => x !== undefined)}
        {results}
        {cxt.config.options.footerPlugins
            .map((x) => x(cxt))
            .filter((x) => x !== undefined)}
        </section>
        </section>
    );
    for (const p of cxt.config.options.postprocessPlugins) {
        p(cxt, doc);
    }
    return doc;
});

htmlConfig.paragraphRenderer = (node, cxt) =>
    <p>{node.content.flatMap((x) => cxt.renderEntity(x))}</p>;

htmlConfig.textRenderer = (node, cxt) => {
    switch (node.type) {
        case NodeType.Preformatted:
            return new Text(node.content.text);
        case NodeType.Text:
        case NodeType.Escaped:
            const split = node.content.split('\n');
            const result = [];
            for (let i = 0; i < split.length; i++) {
                result.push(new Text(split[i]));
                if (i < split.length - 1)
                    result.push(<br/>);
            }
            return result;
        default:
            return debug.never(node);
    }
}

htmlConfig.undefinedBlockRenderer = (node, cxt) => {
    return cxt.state.invalidBlock(node, `No renderer defined! for ${node.mod.name}`);
}

htmlConfig.undefinedInlineRenderer = (node, cxt) => {
    return cxt.state.invalidInline(node, `No renderer defined! for ${node.mod.name}`);
}

htmlConfig.addBlockRenderer(
    ...HeadingBlockRenderersHTML,
    ...BulletBlockRenderersHTML,
    CodeBlockRendererHTML,
    ...QuoteBlockRenderersHTML,
    ...MiscBlockRenderersHTML,
    ...NoteBlockRenderersHTML,
    ...TableBlockRenderers,
    GalleryBlockRendererHTML
);

htmlConfig.addInlineRenderer(
    CodeInlineRendererHTML,
    ...InlineStyleRenderersHTML,
    ...MiscInlineRenderersHTML,
    ...NoteInlineRenderersHTML,
    ...TableInlineRenderers,
)

export const HTMLRenderConfiguration
    : ReadonlyRenderConfiguration<HTMLRenderType> = htmlConfig;
