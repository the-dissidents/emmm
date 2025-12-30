import { NodeType } from "../interface";
import { BlockModifierDefinition, ModifierSlotType } from "../modifier";
import { BlockRendererDefiniton } from "../renderer";
import { HTMLRenderType } from "./html-renderer";

export const GalleryBlock = new BlockModifierDefinition(
    'gallery', ModifierSlotType.Normal,
{});

export const GalleryBlockRendererHTML = [GalleryBlock,
    (node, cxt) => {
        const content = (node.content[0].type == NodeType.Group && node.content.length == 1)
            ? node.content[0].content
            : node.content;

        return <ul class='gallery'>
            {content.map((x) => <li>
                {cxt.state.render([x], cxt)}
            </li>)}
        </ul>;
    }
] satisfies BlockRendererDefiniton<HTMLRenderType>;
