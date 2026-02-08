import * as emmm from "@the_dissidents/libemmm";
import { emmmDocument } from "./ParseData";
import { linter, type Diagnostic } from "@codemirror/lint";
import { getLintRules } from "$lib/emmm/Linting";
import { getReplacement } from "$lib/details/Replace";

export type EmmmDiagnostic = Diagnostic & {
    location: emmm.LocationRange
};

export const emmmLinter = (onLint?: (d: EmmmDiagnostic[]) => void) => linter((view) => {
    const doc = view.state.field(emmmDocument);
    if (!doc) return [];
    let msgs: EmmmDiagnostic[] = [];
    for (const msg of doc.data.messages) {
        msgs.push({
            location: msg.location,
            from: msg.location.start, to: msg.location.end,
            severity: ({
                [emmm.MessageSeverity.Info]: 'info',
                [emmm.MessageSeverity.Warning]: 'warning',
                [emmm.MessageSeverity.Error]: 'error'
            } as const)[msg.severity],
            message: emmm.debugPrint.message(msg)
        });
    }

    const rules = getLintRules(doc.data.context.config);

    const texts: emmm.TextNode[] = [];
    doc.data.walk((n) => {
        if (n.type == emmm.NodeType.Text) {
            texts.push(n);
        }
        return 'continue';
    });

    outer: for (const rule of rules) {
        for (const text of texts) {
            for (const match of text.content.matchAll(rule.pattern)) {
                if (match[0].length == 0) continue;
                if (msgs.length > 100) break outer;
                const start = text.location.start + match.index;
                const end = start + match[0].length;

                const insert = rule.replacement
                    ? getReplacement(match, rule.replacement)
                    : undefined;

                msgs.push({
                    location: {
                        source: text.location.source,
                        start, end
                    },
                    from: start, to: end,
                    severity: 'warning',
                    message: rule.description ?? 'No description given',
                    actions: insert ? [
                        {
                            name: `change to: "${insert}"`,
                            apply(view, from, to) {
                                view.dispatch({ changes: { from, to, insert } });
                            },
                        }
                    ] : []
                });
            }
        }
    }

    msgs.sort((a, b) => a.from - b.from);

    onLint?.(msgs);

    return msgs;
}, { delay: 500 });
