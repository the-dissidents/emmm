import { Facet, type Text } from "@codemirror/state";
import * as emmm from '@the_dissidents/libemmm';
import { emmmDocument } from "./ParseData";
import { Debug } from "$lib/Debug";

export enum FoldUnit {
    Begin, End, Vertical, Top, Bottom, Space, BottomJoin, TopJoin
}

export type LineStructure = {
    folds: FoldUnit[],
    indentation: {hanging: number, normal: number}
};

const SINGLELINE_HANGING = 2;
const HANGING_MAX_LANGTH = 6;

class Structure {
    private lines: LineStructure[] = [];

    constructor(
        private text: Text,
        private doc: emmm.Document
    ) {}

    compute() {
        this.lines = [];
        // add one extra line to avoid trouble in some edge cases
        for (let i = 0; i <= this.text.lines; i++)
            this.lines.push({
                folds: [],
                indentation: { hanging: 0, normal: 0 }
            });
        this.#makeFold(this.doc.root);
        return this.lines;
    }

    #reformatFolds(
        line: LineStructure, newWidth: number,
        terminal: FoldUnit, middle: FoldUnit, joiner: FoldUnit
    ) {
        const oldWidth = line.folds.length;
        for (let i = 0; i < oldWidth; i++) {
            if (line.folds[i] == FoldUnit.Space) line.folds[i] = middle;
            else if (line.folds[i] == FoldUnit.Begin || line.folds[i] == FoldUnit.End)
                line.folds[i] = joiner;
        }
        for (let j = oldWidth; j <= newWidth; j++) {
            if (j == newWidth) line.folds.push(terminal);
            else line.folds.push(middle);
        }
    }

    #makeBlock(from: number, to: number, parent: emmm.DocumentNode, content: emmm.DocumentNode[]) {
        if (to >= this.lines.length) to = this.lines.length - 1;

        // do not display gutter for single-line blocks
        if (from >= this.lines.length || from == to) return 0;
        if (content.length == 0) return 0;

        const width = Math.max(...content.map((x) => this.#makeFold(x, parent)));

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

    #makeFold(node: emmm.DocumentNode, parent?: emmm.DocumentNode): number {
        if (node.type !== emmm.NodeType.Root
         && node.location.source != this.doc.root.source) return 0;

        let width = 0;
        switch (node.type) {
            case emmm.NodeType.Root:
                return Math.max(width, ...node.content.map((x) => this.#makeFold(x, node)));
            case emmm.NodeType.Group:
                if (!parent
                    || parent.type == emmm.NodeType.BlockModifier
                    || parent.type == emmm.NodeType.SystemModifier
                ) {
                    return Math.max(width, ...node.content.map((x) => this.#makeFold(x, node)));
                } // else fallthrough
            case emmm.NodeType.Paragraph:
                // FIXME: should include --:
                return this.#makeBlock(
                    this.text.lineAt(node.location.start).number,
                    this.text.lineAt(node.location.actualEnd ?? node.location.end).number,
                    node, node.content);
            case emmm.NodeType.SystemModifier:
            case emmm.NodeType.InlineModifier:
            case emmm.NodeType.BlockModifier:
                const {number: l0} = this.text.lineAt(node.head.start);
                const {number: l1} = this.text.lineAt(node.head.end);
                const {number: l2} = this.text.lineAt(node.location.actualEnd ?? node.location.end);

                if (l1 > l0)
                    for (let i = l0 + 1; i <= l1; i++)
                        this.lines[i].indentation.normal =
                            Math.max(this.lines[i].indentation.normal, SINGLELINE_HANGING);
                this.lines[l0].indentation.hanging =
                    Math.max(this.lines[l0].indentation.hanging, SINGLELINE_HANGING);

                if (node.content.length > 0) {
                    const {number: line, from} = this.text.lineAt(node.content[0].location.start);
                    if (line == l1 && node.type !== emmm.NodeType.InlineModifier) {
                        // do hanging indentation
                        let hang = Math.min(HANGING_MAX_LANGTH,
                            node.content[0].location.start - from);
                        if (l2 > l1)
                            for (let i = l1 + 1; i <= l2; i++)
                                this.lines[i].indentation.normal =
                                    Math.max(this.lines[i].indentation.normal, hang);
                        this.lines[l1].indentation.hanging =
                            Math.max(this.lines[l1].indentation.hanging, hang);
                    }
                }
                if (node.content.length == 1
                    && this.text.lineAt(node.content[0].location.start).number == l1)
                    return this.#makeFold(node.content[0], node);
                return this.#makeBlock(l1, l2, node, node.content);
            case emmm.NodeType.Preformatted:
            case emmm.NodeType.Text:
            case emmm.NodeType.Escaped:
                return 0;
            default:
                Debug.never(node);
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
