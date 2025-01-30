import { defaultKeymap, history, indentWithTab } from "@codemirror/commands";
import { linter, type Diagnostic } from "@codemirror/lint";
import { EditorState, Facet, RangeSet, RangeSetBuilder, StateEffect, StateField, Text, type Extension } from "@codemirror/state";
import { Decoration, drawSelection, EditorView, gutter, GutterMarker, keymap, lineNumbers, ViewPlugin, ViewUpdate, type DecorationSet } from "@codemirror/view";
import * as emmm from '@the_dissidents/libemmm';

enum FoldUnit {
    Begin, End, Vertical, Top, Bottom, Space, BottomJoin, TopJoin
}

export type EmmmParseData = {
    data: emmm.Document,
    time: number,
    foldStructure: FoldUnit[][]
}

export const emmmDocument = StateField.define<EmmmParseData | undefined>({
    create(state) {
        let folds: FoldUnit[][] = [[]];
        for (let i = 0; i < state.doc.lines; i++) folds.push([]);

        function lineAt(pos: number) {
            return state.doc.lineAt(pos).number
        }
        function remakeLine(len: number, 
            line: FoldUnit[], uend: FoldUnit, uline: FoldUnit, urepl: FoldUnit) 
        {
            const oldLen = line.length;
            for (let i = 0; i < oldLen; i++) {
                if (line[i] == FoldUnit.Space) line[i] = uline;
                else if (line[i] == FoldUnit.Begin || line[i] == FoldUnit.End)
                    line[i] = urepl;
            }
            for (let j = oldLen; j <= len; j++) {
                if (j == len) line.push(uend);
                else line.push(uline);
            }
        }
        function makeContent(l1: number, l2: number, content: emmm.DocumentNode[]) {
            if (l1 >= folds.length) return 0;
            if (l2 >= folds.length) l2 = folds.length - 1;
            if (l1 == l2) return 0;
            if (content.length == 0) return 0;
            let inside = 0;
            content.forEach((x) => 
                { inside = Math.max(inside, makeFold(x)); });
            remakeLine(inside, folds[l1], FoldUnit.Begin, FoldUnit.Top, FoldUnit.TopJoin);
            for (let i = l1+1; i < l2; i++) {
                for (let j = folds[i].length; j < inside; j++)
                    folds[i].push(FoldUnit.Space);
                folds[i].push(FoldUnit.Vertical);
            }
            remakeLine(inside, folds[l2], FoldUnit.End, FoldUnit.Bottom, FoldUnit.BottomJoin);
            return inside + 1;
        }
        function makeFold(node: emmm.DocumentNode): number {
            let inside = 0;
            switch (node.type) {
                case emmm.NodeType.Root:
                    node.content.forEach((x) => 
                        { inside = Math.max(inside, makeFold(x)); });
                    return inside;
                case emmm.NodeType.Paragraph:
                    // FIXME: should include --:
                    return makeContent(
                        lineAt(node.start), 
                        lineAt(node.actualEnd ?? node.end), node.content);
                case emmm.NodeType.SystemModifier:
                case emmm.NodeType.InlineModifier:
                case emmm.NodeType.BlockModifier:
                    let l1 = lineAt(node.head.end);
                    let l2 = lineAt(node.actualEnd ?? node.end);
                    if (node.content.length == 1 
                     && lineAt(node.content[0].start) == l1)
                        return makeFold(node.content[0]);
                    return makeContent(l1, l2, node.content);
                case emmm.NodeType.Preformatted:
                case emmm.NodeType.Text:
                case emmm.NodeType.Escaped:
                default:
                    return 0;
            }
        }

        emmm.setDebugLevel(emmm.DebugLevel.Warning);
        const config = state.facet(emmmConfiguration);
        const start = performance.now();
        const scanner = new emmm.SimpleScanner(state.doc.toString());
        const result = emmm.parse(scanner, new emmm.Configuration(config));
        makeFold(result.root);
        return {
            data: result,
            time: performance.now() - start,
            foldStructure: folds
        };
    },

    update(value, transaction) {
        if (!transaction.docChanged) return value;
        const state = transaction.state;
        return this.create(state);
    }
});

export const emmmConfiguration = 
    Facet.define<emmm.ReadonlyConfiguration, emmm.ReadonlyConfiguration>({
        combine: (values) => values.length ? values.at(-1)! : emmm.BuiltinConfiguration,
    });

function highlightArgument(arg: emmm.ModifierArgument, builder: RangeSetBuilder<Decoration>) {
    function highlight(cls: string, range: emmm.PositionRange) {
        builder.add(range.start, range.end, Decoration.mark({class: cls})); 
    }
    arg.content.forEach((x) => {
        switch (x.type) {
            case emmm.NodeType.Text:
                return highlight('em-args', x);
            case emmm.NodeType.Escaped:
                highlight('em-escape', {start: x.start, end: x.start+1});
                return highlight('em-args', {start: x.start+1, end: x.end});
            case emmm.NodeType.Interpolation:
                const p1 = x.argument.start;
                const p2 = x.argument.end;
                if (p1 == p2)
                    return highlight('em-interp', x);
                else {
                    highlight('em-interp', {start: x.start, end: p1});
                    highlightArgument(x.argument, builder);
                    return highlight('em-interp', {start: p2, end: x.end});
                }
            default:
                return;
        }
    });
}

function highlightNode(node: emmm.DocumentNode, builder: RangeSetBuilder<Decoration>) {
    function highlight(cls: string, range: emmm.PositionRange = node) {
        builder.add(range.start, range.end, Decoration.mark({class: cls})); 
    }
    switch (node.type) {
        case emmm.NodeType.Root:
        case emmm.NodeType.Paragraph:
            node.content.forEach((x) => highlightNode(x, builder));
            return;
        case emmm.NodeType.Preformatted:
            return highlight('em-pre');
        case emmm.NodeType.Text:
            return highlight('em-text');
        case emmm.NodeType.Escaped:
            highlight('em-escape', {start: node.start, end: node.start+1});
            return highlight('em-text', {start: node.start+1, end: node.end});
        case emmm.NodeType.SystemModifier:
        case emmm.NodeType.InlineModifier:
        case emmm.NodeType.BlockModifier:
            const cls = node.type == emmm.NodeType.SystemModifier 
                ? 'em-system' : 'em-modifier';
            if (node.arguments.length == 0) {
                highlight(cls, node.head);
            } else {
                const p1 = node.arguments[0].start;
                highlight(cls, {start: node.head.start, end: p1});
                for (let i = 0; i < node.arguments.length; i++) {
                    highlightArgument(node.arguments[i], builder);
                    const p2 = node.arguments.at(i+1)?.start ?? node.head.end;
                    highlight(cls, {start: node.arguments[i].end, end: p2});
                }
            }
            if (node.type == emmm.NodeType.InlineModifier 
             && node.mod.flags == emmm.ModifierFlags.Preformatted)
            {
                highlight('em-pre', {start: node.head.end, end: node.actualEnd ?? node.end});
            } else {
                node.content.forEach((x) => highlightNode(x, builder));
            }
            if (node.actualEnd)
                highlight(cls, {start: node.actualEnd, end: node.end});
            return;
        default:
            break;
    }
}

export const EmmmLanguageSupport: Extension = [
    emmmDocument.extension,
    // highlighter
    ViewPlugin.fromClass(class {
        decorations: DecorationSet = RangeSet.empty;

        make(doc: EmmmParseData) {
            let builder = new RangeSetBuilder<Decoration>();
            highlightNode(doc.data.root, builder);
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
    }),
    // messages
    linter((view) => {
        const doc = view.state.field(emmmDocument);
        if (!doc) return [];
        let msgs: Diagnostic[] = [];
        for (const msg of doc.data.messages) {
            msgs.push({
                from: msg.start, to: msg.end,
                severity: ({
                    [emmm.MessageSeverity.Info]: 'info',
                    [emmm.MessageSeverity.Warning]: 'warning',
                    [emmm.MessageSeverity.Error]: 'error'
                } as const)[msg.severity],
                message: msg.info,
                // TODO: fixes
            });
        }
        return msgs;
    }, { delay: 1 }),
    // fold gutter
    gutter({
        lineMarker(view, line, otherMarkers) {
            const doc = view.state.field(emmmDocument);
            if (!doc) return null;
            const n = view.state.doc.lineAt(line.from).number;
            const units = doc.foldStructure.at(n)?.toReversed();
            if (!units?.length) return null;
            return new class extends GutterMarker {
                toDOM(view: EditorView): Node {
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
        initialSpacer(view) {
            return new class extends GutterMarker {
                toDOM(view: EditorView): Node {
                    return document.createTextNode("?");
                }
            };
        },
    })
]

export const WrapIndent = ViewPlugin.fromClass(class {
    decorations: DecorationSet;
    makeDecorations(view: EditorView): DecorationSet {
        let tabSize = view.state.facet(EditorState.tabSize);
        let builder = new RangeSetBuilder<Decoration>();
        for (const {from, to} of view.visibleRanges) {
            for (let pos = from; pos <= to;) {
                let line = view.state.doc.lineAt(pos);
                let len = 0;
                for (const ch of line.text) {
                    if (ch == ' ') len += 1;
                    else if (ch == '\t') len += tabSize;
                    else break;
                }
                if (len > 0) builder.add(line.from, line.from, Decoration.line({
                    attributes: { style: `text-indent:-${len}ch;padding-left:${len}ch;` }
                }));
                pos = line.to + 1;
            }
        }
        return builder.finish();
    }

    constructor(view: EditorView) {
        this.decorations = this.makeDecorations(view);
    }

    update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged)
            this.decorations = this.makeDecorations(update.view);
    }
}, {
    decorations: v => v.decorations
});

export let DefaultTheme = EditorView.baseTheme({
    "&": {
        color: "black",
        backgroundColor: "white",
        width: '100%',
        maxWidth: '60em',
        lineHeight: '110%',
        boxShadow: '1px 2px 5px 0px #9E9E9E',
        "&.cm-focused": {
            outline: 'none'
        }
    },
    ".cm-content": {
        caretColor: "black",
        fontFamily: 'Roboto Mono, Menlo, 黑体, Consolas, monospace',
    },
    ".cm-line": {
        // avoid messing up wrap indent above
        padding: '0 15px 0 0',
    },
    ".cm-cursor": {
        borderLeftWidth: '1.5px'
    },
    "&.cm-focused .cm-cursor": {
        borderLeftColor: "black"
    },
    "&.cm-focused .cm-selectionBackground, ::selection": {
        backgroundColor: "#074"
    },
    ".cm-gutters": {
        fontSize: '85%',
        backgroundColor: "lightcoral",
        color: "lavenderblush",
        padding: '0 5px 0 10px',
        // use margin to pad here instead
        marginRight: "15px",
        justifyContent: "right",
        minWidth: '50px',
        border: "none"
    },
    ".cm-gutterElement:nth-child(even)": {
        // TODO: change background color (needs to extend, how?)
        // backgroundColor: "lightpink",
    },
    ".cm-lineNumbers .cm-gutterElement": {
        // TODO: vertically center text
    },

    ".em-pre": {
        fontFamily: 'Courier'
    },
    ".em-text": {
        
    },
    ".em-args": {
        color: 'dimgray'
    },
    ".em-escape": {
        color: 'gainsboro'
    },
    ".em-interp": {
        color: 'darkorange',
        fontWeight: '600'
    },
    ".em-system": {
        color: 'palevioletred',
        fontWeight: '600'
    },
    ".em-modifier": {
        color: 'steelblue',
        fontWeight: '600'
    },
    ".fu-structure-container": {
        height: '100%',
        textAlign: 'right'
    },
    ".fu-structure": {
        display: 'inline-block',
        // backgroundColor: 'red',
        boxSizeing: 'content-box',
        width: '6px',
        height: '100%',
    },
    ".fu-Top": {
        boxShadow: '0 0.5px 0 white inset, 0 -0.5px 0 white',
        transform: 'translate(0, 6px)',
    },
    ".fu-Bottom": {
        boxShadow: '0 -0.5px 0 white inset, 0 0.5px 0 white',
        transform: 'translate(0, -6px)',
    },
    ".fu-Vertical": {
        boxShadow: '-1px 0 0 white',
        transform: 'translate(50%, 0)',
    },
    ".fu-Begin, .fu-TopJoin": {
        boxShadow: '-1px -0.5px 0 white, 0 0.5px 0 white inset',
        transform: 'translate(50%, 6px)',
    },
    ".fu-End, .fu-BottomJoin": {
        boxShadow: '-1px 0.5px 0 white, 0 -0.5px 0 white inset',
        transform: 'translate(50%, -6px)',
    },
});

export function createEditorState(text: Text | string, exts: Extension[]) {
    return EditorState.create({
        doc: text,
        extensions: [
            keymap.of([...defaultKeymap, indentWithTab]),
            history(),
            DefaultTheme,
            EditorView.lineWrapping,
            EditorState.tabSize.of(4),
            WrapIndent,
            EmmmLanguageSupport,
            lineNumbers(),
            drawSelection(),
            exts
        ],
    });
}