import * as dialog from '@tauri-apps/plugin-dialog';
import * as fs from '@tauri-apps/plugin-fs';
import { Document } from './Document.svelte';
import { defaultSource } from '../Templates';
import { Debug } from '$lib/Debug';
import { EventHost } from '@the_dissidents/svelte-ui';

function basename(p: string): string {
    return p.split(/[\\/]/).pop() ?? p;
}

const filter = { name: 'emmm', extensions: ['emmm'] };

class WorkspaceStore {
    #documents = $state<Document[]>([]);
    #activeId = $state<string | null>(null);

    readonly onActiveChanged = new EventHost<[]>();

    get documents(): readonly Document[] {
        return this.#documents;
    }

    get activeId() {
        return this.#activeId;
    }

    get active(): Document | null {
        return this.#documents.find((d) => d.id === this.#activeId) ?? null;
    }

    setActive(id: string | null) {
        Debug.assert(!!this.#documents.find((x) => x.id == id));
        if (id == this.#activeId) return;
        this.#activeId = id;
        this.onActiveChanged.dispatch();
    }

    newDocument(source = defaultSource): Document {
        const doc = new Document(source);
        this.#documents.push(doc);
        this.setActive(doc.id);
        return doc;
    }

    async open(path: string): Promise<Document | null> {
        const text = await fs.readTextFile(path);
        const doc = new Document(text, basename(path));
        doc.filePath = path;
        this.#documents.push(doc);
        this.setActive(doc.id);
        return doc;
    }

    async openDialog(): Promise<Document | null> {
        const selected = await dialog.open({ filters: [filter] });
        const path = Array.isArray(selected) ? selected[0] : selected;
        if (!path) return null;
        return this.open(path);
    }

    async save(doc: Document): Promise<boolean> {
        if (!doc.filePath) return this.saveAs(doc);
        await fs.writeTextFile(doc.filePath, doc.source);
        doc.dirty = false;
        return true;
    }

    async saveAs(doc: Document): Promise<boolean> {
        const path = await dialog.save({ filters: [filter] });
        if (!path) return false;
        doc.filePath = path;
        doc.name = basename(path);
        await fs.writeTextFile(path, doc.source);
        doc.dirty = false;
        return true;
    }

    close(doc: Document): Document | null {
        const idx = this.#documents.indexOf(doc);
        if (idx < 0) return this.active;
        this.#documents.splice(idx, 1);
        doc.close();
        if (this.#activeId !== doc.id) return this.active;
        const next = this.#documents[idx] ?? this.#documents[idx - 1];
        this.setActive(next?.id ?? null);
        return next;
    }
}

export const Workspace = new WorkspaceStore();
