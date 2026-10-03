import type Editor from '../editor/Editor.svelte';
import type { EmmmParseData } from '../editor/ParseData';
import type { EmmmDiagnostic } from '../editor/EmmmLinter';
import { guardAsync, Interface } from '$lib/Interface.svelte';
import { _ } from 'svelte-i18n';
import { get } from 'svelte/store';
import { basename, join } from '@tauri-apps/api/path';
import * as dialog from '@tauri-apps/plugin-dialog';
import * as fs from '@tauri-apps/plugin-fs';
import type { SerializedWorkspace, WorkspaceContext } from './Workspace.svelte';
import { defaultLibrary, defaultStyles } from '$lib/templates';
import { Debug } from '$lib/Debug';
import { CustomConfig } from '$lib/emmm/Custom';
import * as emmm from '@the_dissidents/libemmm';

function autosaveTimestamp(now: Date = new Date()): string {
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0'); // 月份从 0 开始
    const day = String(now.getDate()).padStart(2, '0');

    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');

    // 格式：YYYYMMDD_HHMMSS
    return `${year}${month}${day}_${hours}${minutes}${seconds}`;
}

export abstract class Document {
    abstract readonly name: string;
    abstract readonly path: string | null;

    readonly id: string;

    protected isDirty = $state(false);
    protected isDirtySinceAutosave = false;

    get dirty() {
        return this.isDirty;
    }

    set dirty(value) {
        this.isDirty = value;
        this.isDirtySinceAutosave = value;
    }

    constructor() {
        this.id = crypto.randomUUID();
    }

    close() {}

    abstract save(): Promise<boolean>;
}

export abstract class EditableDocument extends Document {
    protected abstract readonly extension: string;
    abstract readonly name: string;

    source = $state('');
    diagnostics = $state<EmmmDiagnostic[]>([]);
    editor = $state<Editor>();

    protected intervalId: ReturnType<typeof setInterval>;

    constructor() {
        super();
        let first = true;
        this.intervalId = setInterval(async () => {
            if (first) {
                first = false;
                return; // skip the first interval to avoid immediate autosave
            }
            await this.#doAutoSave();
        }, 3 * 1000 * 60);
    }

    close() {
        clearInterval(this.intervalId);
    }

    async #doAutoSave() {
        if (!this.isDirtySinceAutosave) {
            console.log('no change since last autosave');
            return;
        }; // only autosave when changed

        await guardAsync(async () => {
            if (!await fs.exists('autosave', { baseDir: fs.BaseDirectory.AppLocalData }))
                await fs.mkdir('autosave', { baseDir: fs.BaseDirectory.AppLocalData });
            const autoSaveName = (await basename(this.name, '.' + this.extension))
                + '_' + autosaveTimestamp() + '.' + this.extension;
            await fs.writeTextFile(
                await join('autosave', autoSaveName), this.source,
                { baseDir: fs.BaseDirectory.AppLocalData });
            this.isDirtySinceAutosave = false;
            Interface.status.set(get(_)('msg.autosave-complete',
                { values: {time: new Date().toLocaleTimeString(),} }))
        }, get(_)('msg.autosave-failed'));
    }

    override async save(): Promise<boolean> {
        if (!this.path) return false;
        await fs.writeTextFile(this.path, this.source);
        this.dirty = false;
        return true;
    }
}

export abstract class MovableDocument extends EditableDocument {
    protected abstract readonly filter: dialog.DialogFilter[];

    name = $state('');
    path: string | null = $state(null);

    constructor(source: string, name: string, path: string | null) {
        super();
        this.source = source;
        this.name = name;
        this.path = path;
    }

    override async save(): Promise<boolean> {
        if (!this.path) return this.saveAs();
        await fs.writeTextFile(this.path, this.source);
        this.dirty = false;
        return true;
    }

    async saveAs(): Promise<boolean> {
        const path = await dialog.save({ filters: this.filter });
        if (!path) return false;
        this.path = path;
        this.name = await basename(path);
        await fs.writeTextFile(path, this.source);
        this.dirty = false;
        return true;
    }
}

export class EmmmDocument extends MovableDocument {
    static readonly filter = [{ name: 'emmm document', extensions: ['emmm'] }];

    protected override readonly extension = 'emmm';
    protected override readonly filter = EmmmDocument.filter;

    parseData = $state<EmmmParseData>();
}

export abstract class FixedDocument extends EditableDocument {
    protected abstract readonly fixedFilename: string;

    #path: string | null = $state(null);
    get path() { return this.#path; }

    #temporary = true;
    get temporary() { return this.#temporary; }

    constructor(
        protected wksp: WorkspaceContext,
        protected defaultSource: () => string
    ) {
        super();
        this.source = defaultSource();
        this.#path = null;
    }

    async load() {
        Debug.assert(!!this.wksp.path);
        this.#path = await join(this.wksp.path, this.fixedFilename);
        if (await fs.exists(this.#path)) {
            const content = await fs.readTextFile(this.#path);
            this.#temporary = false;
            this.source = content;
            this.dirty = false;
        } else {
            this.#temporary = true;
            this.dirty = true;
        }
    }
}

export class LibDocument extends FixedDocument {
    protected readonly fixedFilename = 'lib.emmm';
    protected readonly extension = 'emmm';

    get name() {
        return get(_)('tab.library');
    }

    constructor(wksp: WorkspaceContext) {
        super(wksp, () => defaultLibrary);
    }

    async load(): Promise<void> {
        await super.load();

        const start = performance.now();
        const ctx = new emmm.ParseContext(emmm.Configuration.from(CustomConfig, false));
        const scanner = new emmm.SimpleScanner(this.source, { name: this.name });
        const data = ctx.parse(scanner);

        this.parseData = { data, parseTime: performance.now() - start, inspector: null };
    }

    parseData = $state<EmmmParseData>();
}

export class StyleDocument extends FixedDocument {
    protected readonly fixedFilename = 'style.scss';
    protected readonly extension = 'scss';

    get name() {
        return get(_)('tab.stylesheet');
    }

    constructor(wksp: WorkspaceContext) {
        super(wksp, () => defaultStyles);
    }

    parseData = $state<EmmmParseData>();
}

export class ConfigDocument extends Document {
    get name() {
        return get(_)('tab.workspace-config');
    }

    #path: string | null = $state(null);
    get path() { return this.#path; }

    constructor(protected wksp: WorkspaceContext) {
        super();
    }

    async load() {
        Debug.assert(!!this.wksp.path);
        this.#path = await join(this.wksp.path, 'emmm-workspace.json');
        if (await fs.exists(this.#path)) {
            this.dirty = false;
        } else {
            this.dirty = true;
        }
    }

    async save(): Promise<boolean> {
        if (!this.#path || !this.wksp.name) return false;

        await fs.writeTextFile(this.#path, JSON.stringify({
            version: 1,
            name: this.wksp.name,
            assetPath: this.wksp.assetPath,
            plugins: []
        } satisfies SerializedWorkspace));
        this.dirty = false;
        return true;
    }
}
