import * as emmm from '@the_dissidents/libemmm';
import { ratingTableBlock } from './RatingTable';

export const ratingEntryBlock = new emmm.BlockModifierDefinition(
    'rating-entry', emmm.ModifierSlotType.Normal,
{
    expand(node, cxt) {
        return [ {
            type: emmm.NodeType.BlockModifier,
            mod: cxt.config.blockModifiers.get('gallery')!,
            location: node.location,
            head: node.head,
            arguments: {
                positional: [],
                named: new Map(),
                location: node.arguments.location
            },
            content: [
                {
                    type: emmm.NodeType.Group,
                    location: node.location,
                    content: node.content
                },
                {
                    type: emmm.NodeType.BlockModifier,
                    mod: ratingTableBlock,
                    location: node.head,
                    head: node.head,
                    arguments: node.arguments,
                    content: []
                }
            ]
        } ];
    },
});
