import type Editor from '../editor/Editor.svelte';
import type { EmmmParseData } from '../editor/ParseData';
import type { EmmmDiagnostic } from '../editor/EmmmLinter';

let untitledCount = 0;

export class Document {
    readonly id: string;
    filePath: string | null = null;
    name = $state('');
    source = $state('');
    dirty = $state(false);
    parseData = $state<EmmmParseData | undefined>(undefined);
    diagnostics = $state<EmmmDiagnostic[]>([]);
    editor = $state<Editor | undefined>(undefined);

    constructor(source = '', name?: string) {
        this.id = crypto.randomUUID();
        this.source = source;
        this.name = name ?? `Untitled ${++untitledCount}`;
    }
}
