import { acceptCompletion, autocompletion, closeCompletion, moveCompletionSelection, startCompletion, type Completion, type CompletionSource } from "@codemirror/autocomplete";
import * as emmm from "@the_dissidents/libemmm";
import { emmmDocument } from "./ParseData";
import { EditorView, keymap } from "@codemirror/view";
import { EditorSelection, Prec } from "@codemirror/state";

const autocompleteSource: CompletionSource = (ctx) => {
    const doc = ctx.state.field(emmmDocument);
    if (!doc) {
        console.log('autocompletion: no doc');
        return null;
    }

    const inspector = doc.inspector ?? {
        position: -1,
        config: doc.data.context.config,
        variables: doc.data.context.variables
    };

    const path = doc.data.resolvePosition(ctx.pos);
    const node = path.at(-1);
    if (!node) return null;

    if ((node.type == emmm.NodeType.InlineModifier && node.mod.name == '$')
     || (node.type == emmm.NodeType.Interpolation && node.definition.name == '$('))
    {
        const vars = [...inspector.variables.keys()];
        const from = node.type == emmm.NodeType.InlineModifier
            ? node.head.start + 3
            : node.location.start + 2;
        return {
            from,
            options: vars.length == 0
                ? [{ label: '', detail: 'no variables defined' }]
                : vars.map((x) => ({ label: x, type: 'variable' }))
        };
    }

    if ((node.type == emmm.NodeType.SystemModifier
      || node.type == emmm.NodeType.InlineModifier
      || node.type == emmm.NodeType.BlockModifier)
     && node.head.end > ctx.pos
     && (node.arguments.location.start >= ctx.pos))
    {
        let completions: Completion[] = [];
        if (node.type == emmm.NodeType.SystemModifier)
            completions = inspector.config.systemModifiers.toArray().map((x) =>
                ({ label: x.name, type: 'keyword' }));
        if (node.type == emmm.NodeType.BlockModifier)
            completions = inspector.config.blockModifiers.toArray().map((x) =>
                ({ label: x.name, type: 'function' }));
        if (node.type == emmm.NodeType.InlineModifier)
            completions = inspector.config.inlineModifiers.toArray().map((x) =>
                ({ label: x.name, type: 'function' }));
        return {
            from: node.head.start + 2,
            options: completions
        };
    }
    return null;
};

export const emmmAutocompletion = [
    EditorView.inputHandler.of((view, from, to, insert) => {
        if (insert.length > 1) return false;
        const doc = view.state.field(emmmDocument);
        if (!doc || !doc.inspector) return false;

        const path = doc.data.resolvePosition(from);
        let context: 'markup' | 'pre' = 'markup';
        for (const e of path) {
            if (e.type === emmm.NodeType.Preformatted
             || e.type === emmm.NodeType.Escaped
             || e.type === emmm.NodeType.Interpolation
            ) {
                context = 'pre';
                break;
            }
            if ((e.type === emmm.NodeType.BlockModifier
              || e.type === emmm.NodeType.InlineModifier
              || e.type === emmm.NodeType.SystemModifier
            ) && e.mod.slotType === emmm.ModifierSlotType.Preformatted
            ) {
                context = 'pre';
                break;
            }
        }

        if (context !== 'markup') return false;
        type Bracket = [string, string];

        const brackets: Bracket[] = [
            ['[.', ']'],
            ['[-', ']'],
            ['[/', ']'],
            ['[;', ']'],
            ...doc.inspector.config.inlineShorthands
                .toArray()
                .filter((x) => x.postfix !== undefined)
                .map((x) => [x.name, x.parts.join('') + x.postfix!] satisfies Bracket)
        ];
        brackets.sort(([a, _1], [b, _2]) => b.length - a.length);

        const text = view.state.doc.sliceString(0, from, '\n') + insert;

        if (from !== to) {
            const bracket = brackets.find(([a, _]) => text.endsWith(a));
            if (!bracket) return false;
            view.dispatch(view.state.changeByRange((range) => ({
                changes: [{
                    from: range.to,
                    insert: bracket[1],
                }, {
                    from: range.from,
                    insert: insert
                }],
                range: EditorSelection.range(
                    range.anchor + insert.length,
                    range.head + insert.length)
            })));
            return true;
        }

        const rest = view.state.doc.sliceString(to);
        if (rest.length > 0 && !rest[0].match(/\s|\n/))
            return false;

        for (const [a, b] of brackets) {
            if (text.endsWith(a)) {
                view.dispatch(view.state.changeByRange((range) => ({
                    changes: [{
                        from: range.from,
                        insert: insert
                    }, {
                        from: range.to,
                        insert: b,
                    }],
                    range: EditorSelection.range(
                        range.anchor + insert.length,
                        range.head + insert.length)
                })));
                return true;
            }
        }
        return false;
    }),
    autocompletion({
        override: [autocompleteSource],
        defaultKeymap: false
    }),
    Prec.high(keymap.of([
        {key: "Ctrl-Space", run: startCompletion},
        // {mac: "Alt-`", run: startCompletion},
        // {mac: "Alt-i", run: startCompletion},
        {key: "Escape", run: closeCompletion},
        {key: "ArrowDown", run: moveCompletionSelection(true)},
        {key: "ArrowUp", run: moveCompletionSelection(false)},
        {key: "Tab", run: acceptCompletion}
    ]))
];
