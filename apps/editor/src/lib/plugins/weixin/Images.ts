import { readFile } from '@tauri-apps/plugin-fs';
import { weixinFetch } from './Network';

export async function imageBlob(value: string): Promise<Blob> {
    const url = new URL(value);
    if (url.protocol === 'file:') return new Blob([await readFile(decodeURIComponent(url.pathname))]);
    if (url.protocol !== 'https:') throw new Error('图片地址无效');
    const response = await weixinFetch(url, { signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`读取图片失败 (${response.status})`);
    return response.blob();
}
export async function imageDimensions(value: string) {
    const url = URL.createObjectURL(await imageBlob(value));
    try {
        const img = new Image();
        img.src = url;
        await img.decode();
        return { width: img.naturalWidth, height: img.naturalHeight };
    } finally { URL.revokeObjectURL(url); }
}
