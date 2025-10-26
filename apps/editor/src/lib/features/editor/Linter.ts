import * as emmm from "@the_dissidents/libemmm";
import { emmmDocument } from "./ParseData";
import { linter, type Diagnostic } from "@codemirror/lint";

export const emmmLinter = linter((view) => {
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
            message: emmm.debugPrint.message(msg)
        });
    }
    return msgs;
}, { delay: 1 });
