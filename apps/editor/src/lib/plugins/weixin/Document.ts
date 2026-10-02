import { Workspace } from '$lib/workspace/Workspace.svelte';
import { setField } from './Fields';

export function writeDocumentField(name: string, value: string) {
    const doc = Workspace.active;
    if (!doc) return;
    const source = setField(doc.source, name, value);
    if (source === doc.source) return;
    if (doc.editor) doc.editor.update({ changes: { from: 0, to: doc.source.length, insert: source } });
    else doc.source = source;
    doc.dirty = true;
}
