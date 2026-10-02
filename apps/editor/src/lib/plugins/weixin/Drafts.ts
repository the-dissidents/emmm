import { get } from 'svelte/store';
import { Memorized } from '$lib/config/Memorized.svelte';
import { WeixinClient, WeixinAPIError } from '$lib/integration/weixin/API.svelte';
import { RustAPI } from '$lib/RustAPI';
import { RequestFailedError, type ProgressReporter } from '$lib/Util';
import { weixinFetch } from './Network';
import { articleMetadata, defaultCrops } from './Fields';
import { imageDimensions } from './Images';
import { plugins } from '../Settings';
import * as z from 'zod/v4-mini';

const links = Memorized.$dict('plugin-weixin-drafts', z.string(), z.object({ id: z.string(), signature: z.string() }));
const covers = Memorized.$dict('plugin-weixin-covers', z.string(), z.string());
const running = new Set<string>();

async function uploadCover(client: WeixinClient, url: URL) {
    const key = `${client.appid}:${await RustAPI.hashFile(url)}`;
    const cached = covers.getItem(key);
    if (cached) return cached;
    const image = await RustAPI.compressImage(url, 2 * 1024 * 1024);
    const form = new FormData(); form.append('media', image.blob, `cover.${image.ext}`);
    const token = await client.fetchToken();
    const response = await weixinFetch('https://api.weixin.qq.com/cgi-bin/material/add_material?'
        + new URLSearchParams({ access_token: token, type: 'image' }), { method: 'POST', body: form });
    if (!response.ok) throw new RequestFailedError(response);
    const result = await response.json();
    if (result.errcode) throw new WeixinAPIError(result);
    if (typeof result.media_id !== 'string') throw new Error('封面上传未返回素材编号');
    covers.setItem(key, result.media_id);
    await Memorized.save();
    return result.media_id;
}

/** Strict draft-only image pipeline: errors propagate, and every body image must have a Weixin URL. */
export async function uploadDraftImages(client: WeixinClient, doc: Document, background: string, report?: ProgressReporter) {
    const urls = [...doc.querySelectorAll<HTMLImageElement>('img')]
        .filter(img => !img.closest('[data-emmm-preview-only]'))
        .map(img => img.dataset.originalSrc ?? img.src);
    if (background) urls.push(background);
    const unique = [...new Set(urls)];
    let uploaded = 0;
    for (const value of unique) {
        const url = new URL(value);
        const hash = await RustAPI.hashFile(url);
        if (!await WeixinClient.getSmallImageCacheUrl(hash)) {
            const image = await RustAPI.compressImage(url, 1024 * 1024);
            await client.uploadSmallImage(image.blob, `body.${image.ext}`, hash);
        }
        report?.(++uploaded, unique.length);
    }
}

export async function saveArticleDraft(options: {
    client: WeixinClient, source: string, doc: Document, key: string,
    content: string, notCached: number, digest: string,
}) {
    if (!plugins.get().drafts) throw new Error('草稿箱插件未启用');
    const {client, source, doc, key, content, notCached, digest} = options;
    if (notCached || doc.querySelector('[data-weixin-plugin-error]')) throw new Error('正文图片或往期回顾未准备完成');
    const metaSource = plugins.get().metadata ? source : source.replace(/^\[-var wx-(?:title|author|digest|cover|cover-mode|crop-wide|crop-square|origin)=.*\]\r?\n?/gm, '');
    const meta = articleMetadata(metaSource, doc);
    // Preserve the title; Weixin validates its actual length rules at draft/add or draft/update.
    // Counting Unicode code points against 32 incorrectly rejects titles accepted by its editor.
    if (!meta.title.trim()) throw new Error('微信标题不能为空');
    if ([...meta.author].length > 16) throw new Error('微信作者最多 16 个字');
    if ([...digest].length > 120) throw new Error('文章摘要超过微信的 120 字限制');
    if (!meta.cover) throw new Error('请选择头图');
    const text = new DOMParser().parseFromString(content, 'text/html').body.textContent ?? '';
    if (!text.trim() || [...text].length >= 20000 || new Blob([content]).size >= 1024 * 1024)
        throw new Error('微信正文须少于 2 万字符、1 MB');
    const scope = `${client.appid}:${key}`;
    if (running.has(scope)) throw new Error('草稿正在保存');
    running.add(scope);
    try {
        await client.fetchToken();
        const dimensions = await imageDimensions(meta.cover);
        const defaults = defaultCrops(dimensions.width, dimensions.height, meta.dual);
        const article = { articleType: 'news' as const, title: meta.title, author: meta.author,
            digest, content, originUrl: meta.origin || null, commentOpen: false,
            coverMediaID: await uploadCover(client, new URL(meta.cover)),
            coverCrop: meta.wide ?? defaults.wide, thumbnailCrop: meta.square ?? defaults.square };
        const signature = JSON.stringify(article);
        const saved = links.getItem(scope);
        if (saved?.signature === signature) return { id: saved.id, updated: false, unchanged: true };
        let id: string;
        if (saved) {
            await client.updateDraft(saved.id, 0, article); id = saved.id;
        } else {
            id = await client.createDraft(article);
            if (!id) throw new Error('微信未返回草稿编号');
        }
        links.setItem(scope, {id, signature});
        await Memorized.save();
        return { id, updated: !!saved, unchanged: false };
    } finally { running.delete(scope); }
}
