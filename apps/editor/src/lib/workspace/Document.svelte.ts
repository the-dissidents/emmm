import type Editor from '../editor/Editor.svelte';
import type { EmmmParseData } from '../editor/ParseData';
import type { EmmmDiagnostic } from '../editor/EmmmLinter';
import * as fs from "@tauri-apps/plugin-fs";
import { guardAsync, Interface } from '$lib/Interface.svelte';
import { _ } from 'svelte-i18n';
import { get } from 'svelte/store';
import { basename, join } from '@tauri-apps/api/path';

let untitledCount = 0;

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

export class Document {
    readonly id: string;
    filePath: string | null = null;
    name = $state('');
    source = $state('');
    parseData = $state<EmmmParseData | undefined>(undefined);
    diagnostics = $state<EmmmDiagnostic[]>([]);
    editor = $state<Editor | undefined>(undefined);

    private isDirty = $state(false);
    private isDirtySinceAutosave = false;
    private intervalId: ReturnType<typeof setInterval>;

    get dirty() {
        return this.isDirty;
    }

    set dirty(value) {
        this.isDirty = value;
        this.isDirtySinceAutosave = value;
    }

    constructor(source = '', name?: string) {
        this.id = crypto.randomUUID();
        this.source = source;
        this.name = name ?? `Untitled ${++untitledCount}`;

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
            const autoSaveName = (await basename(this.name, '.emmm'))
                + '_' + autosaveTimestamp() + '.emmm';
            await fs.writeTextFile(
                await join('autosave', autoSaveName), this.source,
                { baseDir: fs.BaseDirectory.AppLocalData });
            this.isDirtySinceAutosave = false;
            console.log('autosaved');
            Interface.status.set(get(_)('msg.autosave-complete',
                { values: {time: new Date().toLocaleTimeString(),} }))
        }, get(_)('msg.autosave-failed'));
    }
}
