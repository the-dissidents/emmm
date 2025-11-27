import { RangeSet, RangeSetBuilder } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, ViewUpdate, WidgetType, type DecorationSet } from "@codemirror/view";
import * as emmm from "@the_dissidents/libemmm";
import { emmmDocument, type EmmmParseData } from "./ParseData";

type Range = {
    start: number,
    end: number,
    deco: Decoration
};

const WBR = new class WordBreakWidget extends WidgetType {
    toDOM(): HTMLElement {
        return document.createElement('wbr');
    }
};

function highlightArgument(
    arg: emmm.ModifierArgument, base: string, 
    ranges: Range[]
) {
    function highlight(cls: string, start: number, end: number) {
        ranges.push({ start, end, deco: Decoration.mark({ class: cls }) }); 
    }

    function wordBreak(at: number) {
        ranges.push({ start: at, end: at, deco: Decoration.widget({
            widget: WBR
        })});
    }
    
    wordBreak(arg.location.end);

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
                    highlightArgument(x.argument, base, ranges);
                    return highlight(base + ' em-interp', p2, x.location.end);
                }
            default:
                return;
        }
    });
}

function highlightNode(
    node: emmm.DocumentNode, base: string, 
    ranges: Range[], source: emmm.SourceDescriptor
) {
    if (node.type !== emmm.NodeType.Root 
     && node.location.source != source) return 0;
    
    function highlight(cls: string, start: number, end: number) {
        ranges.push({ start, end, deco: Decoration.mark({ class: cls }) }); 
    }
    switch (node.type) {
        case emmm.NodeType.Root:
        case emmm.NodeType.Paragraph:
            node.content.forEach((x) => highlightNode(x, base, ranges, source));
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

            highlight(cls, node.head.start, node.head.end);
            node.arguments.positional.forEach((x) => highlightArgument(x, base, ranges));
            node.arguments.named.forEach((x) => highlightArgument(x, base, ranges));

            if (node.type == emmm.NodeType.InlineModifier 
             && node.mod.slotType == emmm.ModifierSlotType.Preformatted)
            {
                highlight(base + ' em-pre', 
                    node.head.end, node.location.actualEnd ?? node.location.end);
            } else {
                node.content.forEach((x) => highlightNode(x, base, ranges, source));
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
        let ranges: Range[] = [];
        highlightNode(doc.data.root, '', ranges, doc.data.root.source);

        ranges.sort((a, b) => a.start - b.start);
        let builder = new RangeSetBuilder<Decoration>();
        ranges.forEach((x) => builder.add(x.start, x.end, x.deco));
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