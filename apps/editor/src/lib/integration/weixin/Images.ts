import { get } from 'svelte/store';
import { _ } from 'svelte-i18n';
import { Workspace } from '$lib/workspace/Workspace.svelte';
import { join } from '@tauri-apps/api/path';
import { readFile } from '@tauri-apps/plugin-fs';
import { fetch } from '@tauri-apps/plugin-http';

export async function imageBlob(value: string): Promise<Blob> {
    const url = new URL(value);
    if (url.protocol === 'file:')
        return new Blob([await readFile(decodeURIComponent(url.pathname))]);
    if (url.protocol !== 'https:')
        throw new Error(get(_)('weixin.errors.image-address'));
    const response = await fetch(url, {
        signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error(get(_)('weixin.errors.image-read'));
    return response.blob();
}
export async function imageDimensions(value: string) {
    const url = URL.createObjectURL(await imageBlob(value));
    try {
        const img = new Image();
        img.src = url;
        await img.decode();
        return { width: img.naturalWidth, height: img.naturalHeight };
    } finally {
        URL.revokeObjectURL(url);
    }
}

export async function resolveImageURL(value: string) {
    if (/^(file|https?):/.test(value)) return new URL(value).href;
    if (value.startsWith('/')) return new URL('file:' + value).href;
    if (!Workspace.assetPath)
        throw new Error(get(_)('weixin.errors.image-directory'));
    return new URL('file:' + (await join(Workspace.assetPath, value))).href;
}
