import { BlockModifierDefinition, ModifierSlotType } from "../modifier";
import { InvalidArgumentMessage } from "../messages";
import { bindArgs } from "../modifier-helper";
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
            let { msgs, args, nodes } = bindArgs(node, ['number']);
            if (msgs) return msgs;
            let num = Number.parseInt(args!.number);
            if (isNaN(num)) return [
                new InvalidArgumentMessage(nodes!.number.location, 'should be a number')];
            node.state = num;
            return [];
        },
    });

const subItemBlock = new BlockModifierDefinition(
    'subitem', ModifierSlotType.Normal,
    { roleHint: undefined });

export const BulletBlocks = [bulletItemBlock, orderedListItemBlock, subItemBlock];

export const BulletBlockRenderersHTML = [
    [bulletItemBlock, async (node, cxt) =>
        <li class='bullet'>{await cxt.state.render(node.content, cxt)}</li>
    ] satisfies BlockRendererDefiniton<HTMLRenderType>,
    [subItemBlock, async (node, cxt) =>
        <div class='subitem'>{await cxt.state.render(node.content, cxt)}</div>
    ] satisfies BlockRendererDefiniton<HTMLRenderType>,
    [orderedListItemBlock, async (node, cxt) =>
        node.state === undefined
            ? cxt.state.invalidBlock(node, 'bad format')
            : <li class='ordered' value={node.state}>
                {await cxt.state.render(node.content, cxt)}
              </li>
    ] satisfies BlockRendererDefiniton<HTMLRenderType, number>
];
