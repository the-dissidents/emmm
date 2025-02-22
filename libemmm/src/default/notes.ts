import { debug } from "../debug";
import { debugPrint } from "../debug-print";
import { InlineModifierDefinition, ModifierSlotType, BlockModifierDefinition, BlockEntity, NodeType } from "../interface";
import { checkArguments } from "../modifier-helper";
import { ParseContext } from "../parser-config";
import { InlineRendererDefiniton } from "../renderer";
import { stripNode } from "../util";
import { HTMLPostprocessPlugin, HTMLRenderType } from "./html-renderer";

export const notes = Symbol();

type NoteSystem = {
    position: 'block' | 'section' | 'global',
    autonumber: boolean
}

type NoteDefinition = {
    system: string;
    name: string;
    // FIXME: this is broken. Need a better way to figure out real positions so as not to get stuck in definitions.
    position: number;
    content: BlockEntity[]
}

declare module '../parser-config' {
    export interface ParseContextStoreDefinitions {
        [notes]?: {
            systems: Map<string, NoteSystem>,
            definitions: NoteDefinition[]
        };
    }
}

export function initNotes(cxt: ParseContext) {
    cxt.init(notes, {
        systems: new Map(),
        definitions: []
    });
}

const noteMarkerInline = new InlineModifierDefinition<string>(
    'note', ModifierSlotType.None,
    {
        roleHint: 'link',
        prepareExpand(node) {
            let msgs = checkArguments(node, 1);
            if (msgs) return msgs;
            node.state = node.arguments[0].expansion!;
            return [];
        },
    });

const noteInline = new InlineModifierDefinition<string>(
    'note-inline', ModifierSlotType.Normal,
    {
        roleHint: 'quote',
        prepareExpand(node) {
            let msgs = checkArguments(node, 0, 1);
            if (msgs) return msgs;
            node.state = node.arguments.at(0)?.expansion ?? '';
            return [];
        },
        afterProcessExpansion(node, cxt) {
            if (node.state !== undefined) {
                cxt.get(notes)!.definitions.push({
                    system: '',
                    name: node.state,
                    position: node.start,
                    content: [{
                        type: NodeType.Paragraph,
                        start: node.head.end,
                        end: node.end,
                        content: node.content
                    }]
                });
            }
            return [];
        },
    });

const noteBlock = new BlockModifierDefinition<string>(
    'note', ModifierSlotType.Normal,
    {
        roleHint: 'quote',
        prepareExpand(node) {
            let msgs = checkArguments(node, 1);
            if (msgs) return msgs;
            node.state = node.arguments[0].expansion!;
            return [];
        },
        afterProcessExpansion(node, cxt) {
            if (node.state !== undefined) {
                // TODO: check if this is sound in typing
                let content = stripNode(...node.content) as BlockEntity[];
                debug.trace(`added note: system=<${''}> name=${node.state} @${node.start}`);
                debug.trace(`-->\n`, debugPrint.node(...content));
                cxt.get(notes)!.definitions.push({
                    system: '',
                    name: node.state,
                    position: node.start,
                    content: content
                });
            }
            // manually set expansion to nothing
            node.expansion = [];
            return [];
        },
    });

export const NoteBlocks = [noteBlock];
export const NoteInlines = [noteInline, noteMarkerInline];

export const NoteInlineRenderersHTML = [
    [noteMarkerInline, (node, cxt) => {
        if (node.state === undefined)
            return cxt.state.invalidInline(node, 'bad format');
        // find node definition
        const defs = cxt.parseContext.get(notes)!.definitions;
        const note = defs.findIndex((x) => /*x.position >= node.start &&*/ x.name == node.state);
        if (note < 0)
            return `<sup class='note invalid'>Not found: ${node.state}</sup>`;
        return `<sup class='note' id='notemarker-id-${note}'><a href='#note-id-${note}'>${node.state}</a></sup>`;
    }] satisfies InlineRendererDefiniton<HTMLRenderType, string>
];

export const NotesFooterPlugin: HTMLPostprocessPlugin = (cxt) => {
    let defs = cxt.parseContext.get(notes)!.definitions;
    if (defs.length == 0) return undefined;
    return `<hr/><table class='notes'><tbody>
${defs.map((x, i) => 
    `<tr id='note-id-${i}'><td class='note-name'><a href='#notemarker-id-${i}'>${x.name}</a></td>
<td class='note-content'>${
    cxt.state.render(x.content, cxt)
}</td></tr>`).join('\n')}
</tbody></table>`;
}