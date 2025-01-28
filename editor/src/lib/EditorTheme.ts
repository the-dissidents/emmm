import { defaultKeymap, history, indentWithTab } from "@codemirror/commands";
import { linter, type Diagnostic } from "@codemirror/lint";
import { EditorState, Facet, RangeSet, RangeSetBuilder, StateEffect, StateField, Text, type Extension } from "@codemirror/state";
import { Decoration, drawSelection, EditorView, keymap, lineNumbers, ViewPlugin, ViewUpdate, type DecorationSet } from "@codemirror/view";
import * as emmm from '@the_dissidents/libemmm';

export const emmmDocument = StateField.define<emmm.Document | undefined>({
    create() {
        return undefined;
    },
    update(value, transaction) {
        if (!transaction.docChanged) return value;
        const state = transaction.state;
        const config = state.facet(emmmConfiguration);
        const scanner = new emmm.SimpleScanner(state.doc.toString());
        const result = emmm.parse(scanner, new emmm.Configuration(config));
        return result;
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
            node.content.forEach((x) => highlightNode(x, builder));
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

        update(update: ViewUpdate) {
            const prev = update.startState.field(emmmDocument);
            const doc = update.state.field(emmmDocument);
            if (doc && doc !== prev) {
                console.log('highlighting');
                let builder = new RangeSetBuilder<Decoration>();
                highlightNode(doc.root, builder);
                this.decorations = builder.finish();
            }
        }
    }, {
        decorations: v => v.decorations
    }),
    linter((view) => {
        const doc = view.state.field(emmmDocument);
        if (!doc) return [];
        let msgs: Diagnostic[] = [];
        for (const msg of doc.messages) {
            msgs.push({
                from: msg.position,
                to: msg.position + msg.length,
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
    }, { delay: 1 })
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
        fontFamily: 'Menlo',
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
    ".cm-lineNumbers .cm-gutterElement:nth-child(even)": {
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
        fontWeight: 'bold'
    },
    ".em-system": {
        color: 'palevioletred',
        fontWeight: 'bold'
    },
    ".em-modifier": {
        color: 'royalblue',
        fontWeight: 'bold'
    },
});

export function createEditorState(text: Text | string, exts: Extension[]) {
    return EditorState.create({
        doc: text,
        extensions: [
            keymap.of([...defaultKeymap, indentWithTab]),
            history(),
            drawSelection(),
            lineNumbers(),
            DefaultTheme,
            EditorView.lineWrapping,
            EditorState.tabSize.of(4),
            WrapIndent,
            EmmmLanguageSupport,
            exts
        ],
    });
}