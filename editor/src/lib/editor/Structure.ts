import { Facet, StateField, type Text } from "@codemirror/state";
import * as emmm from '@the_dissidents/libemmm';
import { emmmDocument } from "./ParseData";

export enum FoldUnit {
    Begin, End, Vertical, Top, Bottom, Space, BottomJoin, TopJoin
}

export type LineStructure = {
    folds: FoldUnit[],
    indentation: {hanging: number, normal: number}
};

class Structure {
    private lines: LineStructure[] = [];

    constructor(
        private doc: Text,
        private result: emmm.Document
    ) {}

    compute() {
        this.lines = [];
        for (let i = 0; i < this.doc.lines; i++)
            this.lines.push({
                folds: [],
                indentation: { hanging: 0, normal: 0 }
            });
        this.#makeFold(this.result.root);
        return this.lines;
    }

    #reformatFolds(
        line: LineStructure, newLen: number, 
        uend: FoldUnit, uline: FoldUnit, urepl: FoldUnit
    ) {
        const oldLen = line.folds.length;
        for (let i = 0; i < oldLen; i++) {
            if (line.folds[i] == FoldUnit.Space) line.folds[i] = uline;
            else if (line.folds[i] == FoldUnit.Begin || line.folds[i] == FoldUnit.End)
                line.folds[i] = urepl;
        }
        for (let j = oldLen; j <= newLen; j++) {
            if (j == newLen) line.folds.push(uend);
            else line.folds.push(uline);
        }
    }

    #makeBlock(from: number, to: number, content: emmm.DocumentNode[]) {
        if (from >= this.lines.length) return 0;
        if (to >= this.lines.length) to = this.lines.length - 1;
        if (from == to) return 0;
        if (content.length == 0) return 0;

        let width = Math.max(...content.map((x) => this.#makeFold(x)));

        this.#reformatFolds(this.lines[from], width, 
            FoldUnit.Begin, FoldUnit.Top, FoldUnit.TopJoin);

        for (let i = from+1; i < to; i++) {
            for (let j = this.lines[i].folds.length; j < width; j++)
                this.lines[i].folds.push(FoldUnit.Space);
            this.lines[i].folds.push(FoldUnit.Vertical);
        }
        
        this.#reformatFolds(this.lines[to], width, 
            FoldUnit.End, FoldUnit.Bottom, FoldUnit.BottomJoin);

        return width + 1;
    }

    #makeFold(node: emmm.DocumentNode): number {
        if (node.type !== emmm.NodeType.Root 
         && node.location.source != this.result.root.source) return 0;

        let width = 0;
        switch (node.type) {
            case emmm.NodeType.Root:
                return Math.max(width, 
                    ...node.content.map((x) => this.#makeFold(x)));
            case emmm.NodeType.Paragraph:
                // FIXME: should include --:
                return this.#makeBlock(
                    this.doc.lineAt(node.location.start).number, 
                    this.doc.lineAt(node.location.actualEnd ?? node.location.end).number, 
                    node.content);
            case emmm.NodeType.SystemModifier:
            case emmm.NodeType.InlineModifier:
            case emmm.NodeType.BlockModifier:
                const {number: l1} = this.doc.lineAt(node.head.end);
                const {number: l2} = this.doc.lineAt(node.location.actualEnd ?? node.location.end);
                if (node.content.length > 0) {
                    const {number: line, from} = this.doc.lineAt(node.content[0].location.start);
                    if (line == l1 && node.type !== emmm.NodeType.InlineModifier) {
                        // do hanging indentation
                        let hang = node.content[0].location.start - from;
                        if (l2 > line)
                            for (let i = line + 1; i <= l2; i++)
                                this.lines[i].indentation.normal = 
                                    Math.max(this.lines[i].indentation.normal, hang);
                        this.lines[line].indentation.hanging = 
                            Math.max(this.lines[line].indentation.hanging, hang);
                    }
                }
                if (node.content.length == 1 
                    && this.doc.lineAt(node.content[0].location.start).number == l1)
                    return this.#makeFold(node.content[0]);
                return this.#makeBlock(l1, l2, node.content);
            case emmm.NodeType.Preformatted:
            case emmm.NodeType.Text:
            case emmm.NodeType.Escaped:
            default:
                return 0;
        }
    }
}

export const emmmStructure = 
    Facet.define<LineStructure[] | undefined, LineStructure[] | undefined>({
        combine: (values) => values.at(-1) ?? undefined
    });

export const emmmStructureExt =
    emmmStructure.compute([emmmDocument], (state) => {
        const doc = state.field(emmmDocument);
        if (!doc) return undefined;
        return new Structure(state.doc, doc.data).compute();
    });