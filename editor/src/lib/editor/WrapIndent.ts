import { RangeSetBuilder } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, ViewUpdate, type DecorationSet } from "@codemirror/view";
import { emmmStructure } from "./Structure";
import { emmmDocument } from "./ParseData";

export const emmmWrapIndent = ViewPlugin.fromClass(class {
    decorations: DecorationSet;

    makeDecorations(view: EditorView): DecorationSet {
        const builder = new RangeSetBuilder<Decoration>();
        const doc = view.state.facet(emmmStructure);
        if (!doc) return builder.finish();

        for (const {from, to} of view.visibleRanges) {
            for (let pos = from; pos <= to;) {
                const line = view.state.doc.lineAt(pos);
                const indentation = doc[line.number]?.indentation;
                if (indentation && indentation.hanging + indentation.normal > 0) {
                    builder.add(line.from, line.from, Decoration.line({
                        attributes: { style: `text-indent:-${indentation.hanging}ch;padding-left:${indentation.hanging + indentation.normal}ch;` }
                    }));
                }
                pos = line.to + 1;
            }
        }
        return builder.finish();
    }

    constructor(view: EditorView) {
        this.decorations = this.makeDecorations(view);
    }

    update(update: ViewUpdate) {
        const prev = update.startState.facet(emmmStructure);
        const current = update.state.facet(emmmStructure);
        if (current && (current !== prev || update.viewportChanged))
            this.decorations = this.makeDecorations(update.view);
    }
}, {
    decorations: v => v.decorations
});