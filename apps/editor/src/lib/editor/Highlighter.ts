import { RangeSet, RangeSetBuilder } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, ViewUpdate, type DecorationSet } from "@codemirror/view";
import * as emmm from "@the_dissidents/libemmm";
import { emmmDocument, type EmmmParseData } from "./ParseData";

function highlightArgument(
    arg: emmm.ModifierArgument, base: string, 
    builder: RangeSetBuilder<Decoration>
) {
    function highlight(cls: string, start: number, end: number) {
        builder.add(start, end, Decoration.mark({class: cls})); 
    }
    arg.content.forEach((x) => {
        switch (x.type) {
            case emmm.NodeType.Text:
                return highlight(base + ' em-args', x.location.start, x.location.end);
            case emmm.NodeType.Escaped:
                highlight(base + ' em-escape', x.location.start, x.location.start+1);
                return highlight(base + ' em-args', x.location.start+1, x.location.end);
            case emmm.NodeType.Interpolation:
                const p1 = x.argument.location.start;
                const p2 = x.argument.location.end;
                if (p1 == p2)
                    return highlight(base + ' em-interp', x.location.start, x.location.end);
                else {
                    highlight(base + ' em-interp', x.location.start, p1);
                    highlightArgument(x.argument, base, builder);
                    return highlight(base + ' em-interp', p2, x.location.end);
                }
            default:
                return;
        }
    });
}

function highlightNode(
    node: emmm.DocumentNode, base: string, 
    builder: RangeSetBuilder<Decoration>, source: emmm.SourceDescriptor
) {
    if (node.type !== emmm.NodeType.Root 
     && node.location.source != source) return 0;
    
    function highlight(cls: string, start: number, end: number) {
        builder.add(start, end, Decoration.mark({class: cls})); 
    }
    switch (node.type) {
        case emmm.NodeType.Root:
        case emmm.NodeType.Paragraph:
            node.content.forEach((x) => highlightNode(x, base, builder, source));
            return;
        case emmm.NodeType.Preformatted:
            return highlight(base + ' em-pre', node.location.start, node.location.end);
        case emmm.NodeType.Text:
            return highlight(base + ' em-text', node.location.start, node.location.end);
        case emmm.NodeType.Escaped:
            highlight(base + ' em-escape', node.location.start, node.location.start+1);
            return highlight(base + ' em-text', node.location.start+1, node.location.end);
        case emmm.NodeType.SystemModifier:
        case emmm.NodeType.InlineModifier:
        case emmm.NodeType.BlockModifier:
            if (node.mod.roleHint)
                base += ' em-role-' + node.mod.roleHint;
            const cls = (node.type == emmm.NodeType.SystemModifier 
                ? 'em-system' : 'em-modifier') + base;
            if (node.arguments.length == 0) {
                highlight(cls, node.head.start, node.head.end);
            } else {
                const p1 = node.arguments[0].location.start;
                highlight(cls, node.head.start, p1);
                for (let i = 0; i < node.arguments.length; i++) {
                    highlightArgument(node.arguments[i], base, builder);
                    const p2 = node.arguments.at(i+1)?.location.start ?? node.head.end;
                    highlight(cls, node.arguments[i].location.end, p2);
                }
            }
            if (node.type == emmm.NodeType.InlineModifier 
             && node.mod.slotType == emmm.ModifierSlotType.Preformatted)
            {
                highlight(base + ' em-pre', 
                    node.head.end, node.location.actualEnd ?? node.location.end);
            } else {
                node.content.forEach((x) => highlightNode(x, base, builder, source));
            }
            if (node.location.actualEnd)
                highlight(cls, node.location.actualEnd, node.location.end);
            return;
        default:
            break;
    }
}

export const emmmHighlighter = ViewPlugin.fromClass(class {
    decorations: DecorationSet = RangeSet.empty;

    make(doc: EmmmParseData) {
        let builder = new RangeSetBuilder<Decoration>();
        highlightNode(doc.data.root, '', builder, doc.data.root.source);
        this.decorations = builder.finish();
    }

    constructor(view: EditorView) {
        const doc = view.state.field(emmmDocument);
        if (!doc) return;
        this.make(doc);
    }

    update(update: ViewUpdate) {
        const prev = update.startState.field(emmmDocument);
        const doc = update.state.field(emmmDocument);
        if (doc && doc !== prev) this.make(doc);
    }
}, {
    decorations: v => v.decorations
})