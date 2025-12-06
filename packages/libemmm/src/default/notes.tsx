import { debug } from "../debug";
import { debugPrint } from "../debug-print";
import { BlockEntity, NodeType, LocationRange } from "../interface";
import { InlineModifierDefinition, ModifierSlotType, BlockModifierDefinition, SystemModifierDefinition } from "../modifier";
import { InvalidArgumentMessage } from "../messages";
import { bindArgs } from "../modifier-helper";
import { ParseContext } from "../parser-config";
import { BlockRendererDefiniton, InlineRendererDefiniton, RenderContext } from "../renderer";
import { stripNode } from "../node-util";
import { HTMLComponentPlugin, HTMLRenderType } from "./html-renderer";

const notes = Symbol();

type NoteSystem = {
    position: 'preserve' | 'global',
    autonumber: boolean
}

type NoteDefinition = {
    id: number;
    system: string;
    name: string;
    location: LocationRange;
    content: BlockEntity[]
}

declare module '../parser-config' {
    export interface ParseContextStoreDefinitions {
        [notes]?: {
            systems: Map<string, NoteSystem>,
            defaultSystem: NoteSystem,
            definitions: NoteDefinition[],
            currentId: number
        };
    }
}

export function initNotes(cxt: ParseContext) {
    cxt.init(notes, {
        systems: new Map(),
        defaultSystem: {
            position: 'preserve',
            autonumber: false
        },
        definitions: [],
        currentId: 0
    });
}

function getSystem(cxt: ParseContext, name?: string) {
    const defs = cxt.get(notes)!;
    let system: NoteSystem;
    if (name) {
        if (!defs.systems.has(name)) {
            system = { ...defs.defaultSystem };
            defs.systems.set(name, system);
        } else {
            system = defs.systems.get(name)!;
        }
    } else {
        system = defs.defaultSystem;
    }
    return system;
}

const notePositionSystem = new SystemModifierDefinition(
    'note-position', ModifierSlotType.None,
{
    prepareExpand(node, cxt) {
        let { msgs, args, nodes } = bindArgs(node, ['type'], { optional: ['name'], trim: true });
        if (msgs) return msgs;
        if (args!.type != 'global' && args!.type != 'preserve')
            return [new InvalidArgumentMessage(nodes!.type.location,
                "should be `preserve` or `global`")];
        getSystem(cxt, args!.name).position = args!.type;
        return [];
    },
});

const noteRenumberingSystem = new SystemModifierDefinition(
    'note-renumbering', ModifierSlotType.None,
{
    prepareExpand(node, cxt) {
        let { msgs, args, nodes } = bindArgs(node, ['type'], { optional: ['name'], trim: true });
        if (msgs) return msgs;
        if (args!.type != 'on' && args!.type != 'off')
            return [new InvalidArgumentMessage(nodes!.type.location,
                "should be `preserve` or `global`")];
        getSystem(cxt, args!.name).autonumber = args!.type == 'on';
        return [];
    },
});

const noteMarkerInline = new InlineModifierDefinition<string>(
    'note', ModifierSlotType.None,
{
    roleHint: 'link',
    prepareExpand(node) {
        let { msgs, args } = bindArgs(node, ['index']);
        if (msgs) return msgs;
        node.state = args?.index;
        return [];
    },
});

const noteInline = new InlineModifierDefinition<string>(
    'note-inline', ModifierSlotType.Normal,
{
    roleHint: 'quote',
    prepareExpand(node) {
        let { msgs, args } = bindArgs(node, [], { optional: ['index'] });
        if (msgs) return msgs;
        node.state = args?.index ?? '';
        return [];
    },
    beforeProcessExpansion(node, cxt) {
        if (node.state !== undefined) {
            const defs = cxt.get(notes)!;
            defs.definitions.push({
                system: '',
                id: defs.currentId,
                name: node.state,
                location: node.location,
                content: [{
                    type: NodeType.Paragraph,
                    location: {
                        source: node.location.source,
                        start: node.head.end,
                        end: node.location.actualEnd ?? node.location.end
                    },
                    content: node.content
                }],
            });
            defs.currentId++;
        }
        return [];
    },
});

const noteBlock = new BlockModifierDefinition<NoteDefinition>(
    'note', ModifierSlotType.Normal,
{
    roleHint: 'quote',
    prepareExpand(node, cxt) {
        let { msgs, args } = bindArgs(node, ['name'], { optional: ['system'], trim: true });
        if (msgs) return msgs;

        // TODO: check if this is sound in typing
        const content = stripNode(...node.content) as BlockEntity[];
        debug.trace(`add note: system=<${''}> name=${args!.name} @${node.location.start}`);
        debug.trace(`-->\n`, debugPrint.node(...content));

        const defs = cxt.get(notes)!;
        const entry: NoteDefinition = {
            id: defs.currentId,
            system: args!.system ?? '',
            name: args!.name,
            location: node.location,
            content: content
        };
        defs.currentId++;
        defs.definitions.push(entry);
        node.state = entry;
        return [];
    },
});

export const NoteBlocks = [noteBlock];
export const NoteInlines = [noteInline, noteMarkerInline];
export const NoteSystems = [notePositionSystem, noteRenumberingSystem];

function makeNoteHTML(def: NoteDefinition, cxt: RenderContext<HTMLRenderType>) {
    return <section class='note' id={`note-id-${def.id}`}>
        <div class='note-name'>
            <p><a href={`#notemarker-id-${def.id}`}>{def.name}</a></p>
        </div>
        <div class='note-content'>
            {cxt.state.render(def.content, cxt)}
        </div>
    </section>
}

export const NoteInlineRenderersHTML = [
    [noteMarkerInline, (node, cxt) => {
        if (node.state === undefined)
            return cxt.state.invalidInline(node, 'bad format');
        // find node definition
        const defs = cxt.parsedDocument.context.get(notes)!.definitions;
        const note = defs.findIndex((x) => /*x.position >= node.start &&*/ x.name == node.state);
        return <sup class='note' id={`notemarker-id-${note}`}>
                 {note < 0
                    ? `Not found: ${node.state}`
                    : <a href={`#note-id-${note}`}>{node.state}</a>}
               </sup>;
    }] satisfies InlineRendererDefiniton<HTMLRenderType, string>,
];

export const NoteBlockRenderersHTML = [
    [noteBlock, (node, cxt) => {
        if (node.state === undefined)
            return cxt.state.invalidBlock(node, 'bad format');
        const defs = cxt.parsedDocument.context.get(notes)!;
        const system = defs.systems.get(node.state.system) ?? defs.defaultSystem;
        if (system.position != 'preserve') return [];
        return makeNoteHTML(node.state, cxt);
    }] satisfies BlockRendererDefiniton<HTMLRenderType, NoteDefinition>,
];

export const NotesFooterPlugin: HTMLComponentPlugin = (cxt) => {
    const defs = cxt.parsedDocument.context.get(notes)!;
    const items = cxt.parsedDocument.context.get(notes)!
        .definitions
        .filter((x) => (defs.systems.get(x.system) ?? defs.defaultSystem).position == 'global');
    if (items.length == 0) return undefined;
    return [
        <hr/>,
        <section class='notes-global'>
            {items.map((x) => makeNoteHTML(x, cxt))}
        </section>
    ];
}
