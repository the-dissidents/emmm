import { debug } from "../debug";
import { BlockEntity, InlineEntity, ModifierArgument, NodeType, ParagraphNode } from "../interface";
import { BlockModifierDefinition, ModifierSlotType } from "../modifier";
import { bindArgs, onlyPermitSimpleParagraphs } from "../modifier-helper";

export const RawBlockMod = new BlockModifierDefinition
    ('raw', ModifierSlotType.Preformatted,
{
    expand(node) {
        return node.content;
    },
});

export const ConcatBlockMod = new BlockModifierDefinition<ModifierArgument>
    ('concat', ModifierSlotType.Normal,
{
    prepareExpand(node) {
        let { msgs, nodes } = bindArgs(node, [], { named: { sep: '' } });
        if (msgs) return msgs;
        msgs = onlyPermitSimpleParagraphs(node);
        if (msgs) return msgs;

        node.state = nodes?.sep;
        return [];
    },
    expand(node) {
        const result: ParagraphNode = {
            location: node.location,
            type: NodeType.Paragraph,
            content: []
        };
        function separator() {
            if (node.state?.expansion)
                result.content.push({
                    type: NodeType.Text,
                    location: node.state.location,
                    content: node.state.expansion!
                });
        }
        function work(nodes: BlockEntity[]) {
            for (const n of nodes) switch (n.type) {
                case NodeType.Paragraph:
                    result.content.push(...n.content);
                    separator();
                    break;
                case NodeType.Group:
                    work(n.content);
                    break;
                case NodeType.BlockModifier:
                    if (n.expansion) work(n.expansion);
                    break;
                case NodeType.Preformatted:
                case NodeType.SystemModifier:
                    break;
                default:
                    debug.never(n);
            }
        }
        work(node.content);

        if (node.state?.expansion && result.content.length > 0)
            result.content.pop();
        return [result];
    },
});
