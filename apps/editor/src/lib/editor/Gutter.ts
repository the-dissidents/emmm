import { gutter, GutterMarker } from "@codemirror/view";
import { emmmStructure, FoldUnit } from "./Structure";

export const emmmGutter = gutter({
    lineMarker(view, line) {
        const doc = view.state.facet(emmmStructure);
        if (!doc) return null;
        
        const n = view.state.doc.lineAt(line.from).number;
        const units = doc.at(n)?.folds.toReversed();
        if (!units?.length) return null;

        return new class extends GutterMarker {
            toDOM(): Node {
                let div = document.createElement('div');
                div.className = 'fu-structure-container';
                for (const unit of units) {
                    let span = document.createElement('span');
                    span.className = `fu-structure fu-${FoldUnit[unit]}`;
                    div.appendChild(span);
                }
                return div;
            }
        };
    },
});