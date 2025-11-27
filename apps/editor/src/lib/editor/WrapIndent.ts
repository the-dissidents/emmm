import { RangeSetBuilder } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, ViewUpdate, WidgetType, type DecorationSet } from "@codemirror/view";
import { emmmStructure } from "./Structure";

class IndentSuggestion extends WidgetType {
    constructor(private hanging: number, private normal: number) {
        super();
    }

    toDOM(): HTMLElement {
        let div = document.createElement('div');
        div.className = 'fu-indentation-container';

        if (this.normal > 0) {
            let div2 = document.createElement('div');
            div2.className = 'fu-indentation';
            div.appendChild(div2);
        }

        // too ugly
        
        // if (this.hanging > 0) {
        //     let div3 = document.createElement('div');
        //     div3.className = 'fu-hanging-visualizer';
        //     div.appendChild(div3);
        // }

        return div;
    }
}

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
                        attributes: { style: `--hanging:${indentation.hanging}ch;--normal:${indentation.normal}ch;` }
                    }));

                    builder.add(line.from, line.from, Decoration.widget({
                        widget: new IndentSuggestion(indentation.hanging, indentation.normal)
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