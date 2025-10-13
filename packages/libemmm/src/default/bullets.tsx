import { BlockModifierDefinition, ModifierSlotType } from "../interface";
import { InvalidArgumentMessage } from "../messages";
import { checkArguments } from "../modifier-helper";
import { BlockRendererDefiniton } from "../renderer";
import { HTMLRenderType } from "./html-renderer";

const bulletItemBlock = new BlockModifierDefinition(
    'bullet-item', ModifierSlotType.Normal,
    { roleHint: undefined });

const orderedListItemBlock = new BlockModifierDefinition<number>(
    'ordered-item', ModifierSlotType.Normal,
    {
        roleHint: undefined,
        prepareExpand(node) {
            let msgs = checkArguments(node, 0, 1);
            if (msgs) return msgs;
            let arg = node.arguments[0];
            let num = Number.parseInt(arg.expansion!);
            if (isNaN(num)) return [
                new InvalidArgumentMessage(arg.location, 'should be a number')];
            node.state = num;
            return []
        },
    });

const subItemBlock = new BlockModifierDefinition(
    'subitem', ModifierSlotType.Normal,
    { roleHint: undefined });

export const BulletBlocks = [bulletItemBlock, orderedListItemBlock, subItemBlock];

export const BulletBlockRenderersHTML = [
    [bulletItemBlock, (node, cxt) => 
        <li>{cxt.state.render(node.content, cxt)}</li>
    ] satisfies BlockRendererDefiniton<HTMLRenderType>,
    [subItemBlock, (node, cxt) => 
        <div class='subitem'>{cxt.state.render(node.content, cxt)}</div>
    ] satisfies BlockRendererDefiniton<HTMLRenderType>,
    [orderedListItemBlock, (node, cxt) => 
        node.state === undefined
            ? cxt.state.invalidBlock(node, 'bad format')
            : <li value={node.state}>{cxt.state.render(node.content, cxt)}</li>
    ] satisfies BlockRendererDefiniton<HTMLRenderType, number>
];