import { acceptCompletion, autocompletion, closeCompletion, moveCompletionSelection, startCompletion, type Completion, type CompletionSource } from "@codemirror/autocomplete";
import * as emmm from "@the_dissidents/libemmm";
import { emmmDocument } from "./ParseData";
import { keymap } from "@codemirror/view";
import { Prec } from "@codemirror/state";

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

    const node = doc.data.resolvePosition(ctx.pos).at(-1);
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
     && node.head.end >= ctx.pos
     && (node.arguments.length == 0 || node.arguments[0].location.start > ctx.pos))
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