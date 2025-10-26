import { RustAPI } from "./rustApi";
import { path } from "@tauri-apps/api";
import * as fs from "@tauri-apps/plugin-fs";

import mime from 'mime/lite';
import { readUrl } from "./webUtils";

export async function loadImage(url: URL, maxSizeMB?: number) {
    let file = new File([await readUrl(url)], url.href,
        { type: mime.getType(url.href) ?? undefined });

    if (!maxSizeMB ||
        ((file.type == 'image/png' || file.type == 'image/jpeg')
            && file.size < maxSizeMB * 1024 * 1024))
    {
        return file;
    }

    let filepath = decodeURIComponent(url.pathname);
    if (url.protocol !== 'file:') {
        // save to local
        filepath = await path.join(
            await path.tempDir(),
            crypto.randomUUID() + await path.extname(filepath));
        await fs.writeFile(filepath, file.stream());
    }

    return RustAPI.compressImage(filepath, maxSizeMB * 1024 * 1024);
}
