import * as dialog from '@tauri-apps/plugin-dialog';
import * as fs from '@tauri-apps/plugin-fs';
import * as z from 'zod/v4-mini';
import { ConfigDocument, Document, EmmmDocument, LibDocument, StyleDocument } from './Document.svelte';
import { defaultSource } from '../Templates';
import { Debug } from '$lib/Debug';
import { EventHost } from '@the_dissidents/svelte-ui';
import { join } from '@tauri-apps/api/path';

function basename(p: string): string {
    return p.split(/[\\/]/).pop() ?? p;
}

export const SerializedWorkspace = z.object({
    version: z.literal(1),
    name: z.string(),
    assetPath: z.nullable(z.string()),
    plugins: z.array(z.string())
});

export type SerializedWorkspace = z.infer<typeof SerializedWorkspace>;

export class WorkspaceContext {
    #path = $state<string | null>(null);
    #name = $state<string | null>(null);
    #assetPath = $state<string | null>(null);

    readonly config = new ConfigDocument(this);
    readonly library = new LibDocument(this);
    readonly stylesheet = new StyleDocument(this);

    #documents = $state<Document[]>([]);
    #activeId = $state<string | null>(null);

    readonly onActiveDocumentChanged = new EventHost<[]>();
    readonly onWorkspaceChanged = new EventHost<[]>();

    constructor() {}

    /**
     * Open a folder that may or may not contain a workspace. If it contains a workspace, the current one is overridden.
     */
    async open(path: string) {
        this.#path = path;
        this.#name = basename(path);
        this.#assetPath = null;

        const wkspFile = await join(path, 'emmm-workspace.json');
        if (await fs.exists(wkspFile)) {
            try {
                const sw = SerializedWorkspace.parse(JSON.parse(await fs.readTextFile(wkspFile)));
                this.#assetPath = sw.assetPath;
                this.#name = sw.name;
            } catch {}
            this.config.dirty = false;
        }

        await this.library.load();
        await this.stylesheet.load();
        await this.config.load();

        console.log('opened workspace at', path);
        this.onWorkspaceChanged.dispatch();
    }

    get path() { return this.#path; }
    get name() { return this.#name; }
    get assetPath() { return this.#assetPath; }

    set name(x) {
        if (this.#name == x) return;
        this.#name = x;
        this.config.dirty = true;
    }

    set assetPath(x) {
        if (this.#assetPath == x) return;
        this.#assetPath = x;
        this.config.dirty = true;
    }

    get documents(): readonly Document[] { return this.#documents; }
    get activeId() { return this.#activeId; }

    get active(): Document | null {
        return this.#documents.find((d) => d.id === this.#activeId) ?? null;
    }

    setActiveDocument(id: string | null) {
        Debug.assert(id === null || !!this.#documents.find((x) => x.id == id));
        if (id == this.#activeId) return;
        this.#activeId = id;
        this.onActiveDocumentChanged.dispatch();
    }

    #newDocumentCounter = 1;

    newDocument(source = defaultSource): EmmmDocument {
        const doc = new EmmmDocument(source, `Untitled ${this.#newDocumentCounter}`, null);
        this.#newDocumentCounter++;
        this.#documents.push(doc);
        this.setActiveDocument(doc.id);
        return doc;
    }

    openDocument(doc: Document) {
        if (this.documents.includes(doc)) {
            this.setActiveDocument(doc.id);
            return;
        };

        this.#documents.push(doc);
        this.setActiveDocument(doc.id);
    }

    /** If already opened, focus on that document */
    async openDocumentPath(path: string) {
        const existing = this.documents.find(
            (x) => x instanceof EmmmDocument && x.path == path) as EmmmDocument;
        if (existing) {
            this.setActiveDocument(existing.id);
            return existing;
        };

        const text = await fs.readTextFile(path);
        const doc = new EmmmDocument(text, basename(path), path);
        this.#documents.push(doc);
        this.setActiveDocument(doc.id);
        return doc;
    }

    async openDialog(): Promise<EmmmDocument | null> {
        const selected = await dialog.open({ filters: EmmmDocument.filter });
        const path = Array.isArray(selected) ? selected[0] : selected;
        if (!path) return null;
        return this.openDocumentPath(path);
    }

    closeDocument(doc: Document): Document | null {
        const idx = this.#documents.indexOf(doc);
        Debug.assert(idx >= 0);

        doc.close();
        this.#documents.splice(idx, 1);
        if (this.#activeId !== doc.id) return this.active;
        const next = this.#documents[idx] ?? this.#documents[idx - 1];
        this.setActiveDocument(next?.id ?? null);
        return next;
    }
}

export const Workspace = new WorkspaceContext();
