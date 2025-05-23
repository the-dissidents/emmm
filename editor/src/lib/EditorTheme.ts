import { closeBrackets } from "@codemirror/autocomplete";
import { defaultKeymap, history, indentWithTab } from "@codemirror/commands";
import { linter, type Diagnostic } from "@codemirror/lint";
import { EditorState, Facet, RangeSet, RangeSetBuilder, StateField, Text, type Extension } from "@codemirror/state";
import { Decoration, drawSelection, EditorView, gutter, GutterMarker, highlightWhitespace, keymap, lineNumbers, ViewPlugin, ViewUpdate, type DecorationSet } from "@codemirror/view";
import * as emmm from '@the_dissidents/libemmm';

enum FoldUnit {
    Begin, End, Vertical, Top, Bottom, Space, BottomJoin, TopJoin
}

export type EmmmParseData = {
    data: emmm.Document,
    source: string,
    time: number,
    foldStructure: FoldUnit[][],
    indentation: {hanging: number, normal: number}[]
}

export const emmmDocument = StateField.define<EmmmParseData | undefined>({
    create(state) {
        let folds: FoldUnit[][] = [[]];
        let hanging: {hanging: number, normal: number}[] = [];
        for (let i = 0; i <= state.doc.lines; i++) {
            folds.push([]);
            hanging.push({ hanging: 0, normal: 0 });
        }

        function lineAt(pos: number) {
            return state.doc.lineAt(pos)
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
            if (node.type !== emmm.NodeType.Root 
             && node.location.source != result.root.source) return 0;
            switch (node.type) {
                case emmm.NodeType.Root:
                    node.content.forEach((x) => 
                        { inside = Math.max(inside, makeFold(x)); });
                    return inside;
                case emmm.NodeType.Paragraph:
                    // FIXME: should include --:
                    return makeContent(
                        lineAt(node.location.start).number, 
                        lineAt(node.location.actualEnd ?? node.location.end).number, node.content);
                case emmm.NodeType.SystemModifier:
                case emmm.NodeType.InlineModifier:
                case emmm.NodeType.BlockModifier:
                    let {number: l1} = lineAt(node.head.end);
                    let {number: l2} = lineAt(node.location.actualEnd ?? node.location.end);
                    if (node.content.length > 0) {
                        let {number, from} = lineAt(node.content[0].location.start);
                        if (number == l1 && node.type === emmm.NodeType.BlockModifier) {
                            // do hanging indentation
                            let hang = node.content[0].location.start - from;
                            if (l2 > number) for (let i = number + 1; i <= l2; i++)
                                hanging[i].normal = Math.max(hanging[i].normal, hang);
                            hanging[number].hanging = Math.max(hanging[number].hanging, hang);
                        }
                    }
                    if (node.content.length == 1 
                     && lineAt(node.content[0].location.start).number == l1)
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
        const context = state.facet(emmmContextProvider)() 
            ?? new emmm.ParseContext(emmm.Configuration.from(emmm.DefaultConfiguration));
        const start = performance.now();
        const text = state.doc.toString();
        const scanner = new emmm.SimpleScanner(text, state.facet(emmmSourceDescriptorProvider));
        const result = emmm.parse(scanner, context);
        makeFold(result.root);
        return {
            data: result,
            source: text,
            time: performance.now() - start,
            foldStructure: folds,
            indentation: hanging
        };
    },

    update(value, transaction) {
        if (!transaction.docChanged) return value;
        const state = transaction.state;
        return this.create(state);
    }
});

export type ContextProvider = () => (emmm.ParseContext | undefined);
export type DescriptorProvider = () => (emmm.SourceDescriptor | undefined);

export const emmmContextProvider = 
    Facet.define<ContextProvider, ContextProvider>({
        combine: (values) => values.at(-1) ?? (() => undefined),
    });

export const emmmSourceDescriptorProvider = 
    Facet.define<DescriptorProvider, emmm.SourceDescriptor>({
        combine: (values) => values.at(-1)?.() ?? { name: '<unnamed>' },
    });

function highlightArgument(arg: emmm.ModifierArgument, base: string, builder: RangeSetBuilder<Decoration>) {
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

export const EmmmLanguageSupport: Extension = [
    emmmDocument.extension,
    // highlighter
    ViewPlugin.fromClass(class {
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
    }),
    // messages
    linter((view) => {
        const doc = view.state.field(emmmDocument);
        if (!doc) return [];
        let msgs: Diagnostic[] = [];
        for (const msg of doc.data.messages) {
            msgs.push({
                from: msg.location.start, to: msg.location.end,
                severity: ({
                    [emmm.MessageSeverity.Info]: 'info',
                    [emmm.MessageSeverity.Warning]: 'warning',
                    [emmm.MessageSeverity.Error]: 'error'
                } as const)[msg.severity],
                message: emmm.debugPrint.message(msg, doc.source)
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
    })
]

export const WrapIndent = ViewPlugin.fromClass(class {
    decorations: DecorationSet;
    makeDecorations(view: EditorView): DecorationSet {
        let builder = new RangeSetBuilder<Decoration>();
        const doc = view.state.field(emmmDocument);
        if (!doc) return builder.finish();

        for (const {from, to} of view.visibleRanges) {
            for (let pos = from; pos <= to;) {
                const line = view.state.doc.lineAt(pos);
                const indentation = doc.indentation[line.number];
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
        lineHeight: '120%',
        boxShadow: '1px 2px 5px 0px #9E9E9E',
        border: '1px solid lightcoral',
        "&.cm-focused": {
            outline: 'none'
        }
    },
    ".cm-content": {
        caretColor: "black",
        fontFamily: 'Roboto Mono, Menlo, Consolas, 等线, monospace',
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
        fontFamily: 'Roboto Mono, Menlo, Consolas, 等线, monospace',
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
    ".cm-highlightSpace": {
        backgroundImage: "radial-gradient(circle at 50% 55%, #fff 15%, transparent 5%)"
    },

    ".em-pre": {
        fontFamily: 'Courier'
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
    ":where(.em-role-link)": {
        color: 'darkblue',
        textDecoration: 'underline'
    },
    ".em-role-heading": {
        color: 'darkred',
        fontWeight: 'bold'
    },
    ".em-role-emphasis": {
        fontStyle: 'italic'
    },
    ".em-role-keyword": {
        fontWeight: 'bold'
    },
    ".em-role-highlight": {
        backgroundColor: 'color-mix(in srgb, yellow, transparent 50%)'
    },
    ".em-role-commentary": {
        color: 'gray',
    },
    ".em-role-comment": {
        color: 'darkgreen',
        fontStyle: 'italic'
    },

    ".fu-structure-container": {
        height: '100%',
        textAlign: 'right'
    },
    ".fu-structure": {
        display: 'inline-block',
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
            closeBrackets(),
            highlightWhitespace(),
            exts
        ],
    });
}