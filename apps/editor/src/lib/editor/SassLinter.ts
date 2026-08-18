import { compileStyles } from "$lib/Document.svelte";
import { Interface } from "$lib/Interface.svelte";
import { linter, type Diagnostic } from "@codemirror/lint";
import type { EmmmDiagnostic } from "./EmmmLinter";

export const sassLinter = (onLint?: (msgs: EmmmDiagnostic[]) => void) => linter((view) => {
    const text = view.state.doc.toString();
    const result = compileStyles({
        sass: text,
        colors: Interface.colors.get(),
        backgroundImage: Interface.backgroundImage.get()
    });

    if (typeof result == 'string') {
        onLint?.([]);
        return [];
    }

    const { number, from } = view.state.doc.lineAt(result.span.start.offset);

    const msgs: EmmmDiagnostic[] = [{
        source: '<Stylesheet>',
        row: number - 1,
        col: result.span.start.offset - from,
        from: result.span.start.offset,
        to: result.span.end.offset,
        severity: 'error',
        message: result.sassMessage
    }];

    onLint?.(msgs);

    return msgs;
}, { delay: 500 });
