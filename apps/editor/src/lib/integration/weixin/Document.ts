import { Workspace } from '$lib/workspace/Workspace.svelte';
import { EmmmDocument } from '$lib/workspace/Document.svelte';
import { fieldChanges, setField } from './Fields';

export function writeDocumentField(name: string, value: string) {
    const doc = Workspace.active;
    if (!(doc instanceof EmmmDocument)) return;
    const changes = fieldChanges(doc.source, name, value);
    if (!changes.length) return;
    if (doc.editor) doc.editor.update({ changes });
    else doc.source = setField(doc.source, name, value);
    doc.dirty = true;
}

export function removeLegacyFields(doc: EmmmDocument) {
    const names = [
        'wx-history-enabled',
        'wx-crop-wide',
        'wx-crop-square',
        'wx-cover-mode',
    ];
    const changes = names
        .flatMap((name) => fieldChanges(doc.source, name))
        .sort((a, b) => a.from - b.from);
    if (!changes.length) return;
    if (doc.editor) doc.editor.update({ changes });
    else for (const name of names) doc.source = setField(doc.source, name);
    doc.dirty = true;
}

const migrated = new WeakSet<EmmmDocument>();

/** Run once after the editor is available, so legacy removal remains undoable. */
export function migrateDocumentMetadata(doc: EmmmDocument) {
    if (migrated.has(doc) || !doc.editor) return;
    migrated.add(doc);
    removeLegacyFields(doc);
}
