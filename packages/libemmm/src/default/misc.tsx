import { ModifierSlotType, InlineModifierDefinition, BlockModifierDefinition, ParagraphNode } from "../interface";
import { bindArgs, onlyPermitSimpleParagraphs, onlyPermitSingleBlock } from "../modifier-helper";
import { BlockRendererDefiniton, InlineRendererDefiniton } from "../renderer";
import { HTMLRenderType } from "./html-renderer";

const rubyInline = new InlineModifierDefinition<string>(
    'ruby', ModifierSlotType.Normal,
    {
        roleHint: undefined,
        prepareExpand(node) {
            let { msgs, args } = bindArgs(node, ['text']);
            if (msgs) return msgs;
            node.state = args!.text;
            return [];
        },
    });

const linkInline = new InlineModifierDefinition<string>(
    'link', ModifierSlotType.Normal,
    {
        roleHint: 'link',
        prepareExpand(node) {
            let { msgs, args } = bindArgs(node, ['url']);
            if (msgs) return msgs;
            node.state = args!.url;
            return [];
        },
    });

const tabInline = new InlineModifierDefinition<string>(
    'tab', ModifierSlotType.None);

const styleBlock = new BlockModifierDefinition<string>(
    'style', ModifierSlotType.Normal,
    {
        prepareExpand(node) {
            let { msgs, args } = bindArgs(node, ['style']);
            if (msgs) return msgs;
            node.state = args!.style;
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
            let { msgs, args } = bindArgs(node, ['url']);
            if (msgs) return msgs;
            node.state = args!.url;
            return [];
        },
    });

const imageBlock = new BlockModifierDefinition<string>(
    'image', ModifierSlotType.Normal,
    {
        roleHint: 'link',
        prepareExpand(node) {
            let { msgs, args } = bindArgs(node, ['url']);
            if (msgs) return msgs;
            msgs = onlyPermitSingleBlock(node, {optional: true});
            if (msgs) return msgs;
            msgs = onlyPermitSimpleParagraphs(node);
            if (msgs) return msgs;
            node.state = args!.url;
            return [];
        },
    });

export const MiscInlines = [rubyInline, linkInline, tabInline];

export const MiscBlocks = [styleBlock, breakBlock, linkBlock, imageBlock];

export const MiscInlineRenderersHTML = [
    [rubyInline, (node, cxt) => 
        node.state === undefined
            ? cxt.state.invalidInline(node, 'bad format')
            : <ruby>
                {cxt.state.render(node.content, cxt)}
                <rt>{node.state}</rt>
              </ruby>
    ] satisfies InlineRendererDefiniton<HTMLRenderType, string>,
    [linkInline, (node, cxt) =>
        node.state === undefined
            ? cxt.state.invalidInline(node, 'bad format')
            : <a href={encodeURI(node.state)}>
                {cxt.state.render(node.content, cxt)}
              </a>
    ] satisfies InlineRendererDefiniton<HTMLRenderType, string>,
    [tabInline, () => new Text('\t')] satisfies InlineRendererDefiniton<HTMLRenderType>,
];

export const MiscBlockRenderersHTML = [
    [styleBlock, (node, cxt) =>
        node.state === undefined
            ? cxt.state.invalidBlock(node, 'bad format')
            : <div class={`emmmstyle-${node.state}`} style="display:contents">
                {cxt.state.render(node.content, cxt)}
              </div>
    ] satisfies BlockRendererDefiniton<HTMLRenderType, string>,
    [breakBlock, () => <hr/>] satisfies BlockRendererDefiniton<HTMLRenderType>,
    [linkBlock, (node, cxt) => {
        if (node.state === undefined)
            return cxt.state.invalidBlock(node, 'bad format');
        const content = cxt.state.render(node.content, cxt);
        return <a href={encodeURI(node.state)}>
            {content.childElementCount > 0 ? content : node.state}
        </a>;
    }
    ] satisfies BlockRendererDefiniton<HTMLRenderType, string>,
    [imageBlock, (node, cxt) => {
        if (node.state === undefined)
            return cxt.state.invalidBlock(node, 'bad format');
        let transformed: string | undefined;
        try {
            transformed = cxt.config.options.transformAsset(node.state);
        } catch {
            return cxt.state.invalidBlock(node, 'unable to transform asset');
        }
        return <figure>
                 {transformed 
                    ? <img src={transformed} data-original-src={node.state} />
                    : <img src={node.state} />}
                 {node.content.length > 0
                    ? <figcaption>
                        {cxt.state.render((node.content[0] as ParagraphNode).content, cxt)}
                      </figcaption>
                    : []}
               </figure>;
    }] satisfies BlockRendererDefiniton<HTMLRenderType, string>
];