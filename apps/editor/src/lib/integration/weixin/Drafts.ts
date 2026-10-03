import { Memorized } from '$lib/config/Memorized.svelte';
import { WeixinClient, WeixinAPIError, type WeixinArticle } from './API.svelte';
import { RustAPI } from '$lib/RustAPI';
import type { ProgressReporter } from '$lib/Util';
import { articleMetadata, defaultCrops } from './Fields';
import { imageDimensions, resolveImageURL } from './Images';
import { get } from 'svelte/store';
import { _ } from 'svelte-i18n';
import * as z from 'zod/v4-mini';

const linkDefinition = z.object({
    id: z.optional(z.string()),
    signature: z.string(),
    remote: z.optional(z.string()),
    pending: z.optional(
        z.object({ since: z.number(), fingerprint: z.string() })
    ),
});
const links = Memorized.$dict('weixin-drafts', z.string(), linkDefinition);
const covers = Memorized.$dict('weixin-covers', z.string(), z.string());
const oldLinks = Memorized.$dict(
    'plugin-weixin-drafts',
    z.string(),
    z.object({ id: z.string(), signature: z.string() })
);
const oldCovers = Memorized.$dict(
    'plugin-weixin-covers',
    z.string(),
    z.string()
);
const running = new Set<string>();

Memorized.onInitialize(() => {
    for (const [key, value] of oldLinks.get())
        if (!links.getItem(key)) links.setItem(key, value);
    for (const [key, value] of oldCovers.get())
        if (!covers.getItem(key)) covers.setItem(key, value);
    oldLinks.set(new Map());
    oldCovers.set(new Map());
});

export class DraftSyncError extends Error {
    constructor(public code: string) {
        super(get(_)(`weixin.drafts.${code}`));
    }
}

async function fingerprint(article: WeixinArticle) {
    if (article.articleType !== 'news') return '';
    const content = article.content ?? '';
    const value = JSON.stringify([
        article.title,
        article.author ?? '',
        article.digest ?? '',
        article.coverMediaID,
        content.replace(/\r\n/g, '\n'),
        article.originUrl ?? '',
    ]);
    const hash = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(value)
    );
    return [...new Uint8Array(hash)]
        .map((x) => x.toString(16).padStart(2, '0'))
        .join('');
}

async function uploadCover(client: WeixinClient, url: URL) {
    const key = `${client.appid}:${await RustAPI.hashFile(url)}`;
    const cached = covers.getItem(key);
    if (cached) return cached;
    const image = await RustAPI.compressImage(url, 2 * 1024 * 1024);
    const id = await client.uploadCover(image.blob, `cover.${image.ext}`);
    covers.setItem(key, id);
    await Memorized.save();
    return id;
}

export async function uploadDraftImages(
    client: WeixinClient,
    doc: Document,
    background: string,
    report?: ProgressReporter
) {
    const urls = [...doc.querySelectorAll<HTMLImageElement>('img')]
        .filter((img) => !img.closest('[data-emmm-preview-only]'))
        .map((img) => img.dataset.originalSrc ?? img.src);
    if (background) urls.push(background);
    const unique = [...new Set(urls)];
    let uploaded = 0;
    for (const value of unique) {
        const url = new URL(value);
        const hash = await RustAPI.hashFile(url);
        if (!(await WeixinClient.getSmallImageCacheUrl(hash, client.appid))) {
            const image = await RustAPI.compressImage(url, 1024 * 1024);
            await client.uploadSmallImage(
                image.blob,
                `body.${image.ext}`,
                hash
            );
        }
        report?.(++uploaded, unique.length);
    }
}

export async function saveArticleDraft(options: {
    client: WeixinClient;
    source: string;
    doc: Document;
    key: string;
    temporaryKey: string;
    content: string;
    notCached: number;
    digest: string;
    defaults?: {
        title: string;
        author: string;
        origin?: string;
    };
    validate: () => void;
    resolution?: 'overwrite' | 'new';
}) {
    const {
        client,
        source,
        doc,
        key,
        temporaryKey,
        content,
        notCached,
        digest,
        validate,
        resolution,
    } = options;
    const meta = articleMetadata(source, doc, options.defaults);
    if (notCached || doc.querySelector('[data-weixin-history-error]'))
        throw new DraftSyncError('not-ready');
    if (!meta.title.trim()) throw new DraftSyncError('title-required');
    if ([...meta.author].length > 16) throw new DraftSyncError('author-long');
    if ([...digest].length > 120) throw new DraftSyncError('digest-long');
    if (!meta.cover) throw new DraftSyncError('cover-required');
    const text =
        new DOMParser().parseFromString(content, 'text/html').body
            .textContent ?? '';
    if (
        !text.trim() ||
        [...text].length >= 20000 ||
        new Blob([content]).size >= 1024 * 1024
    )
        throw new DraftSyncError('content-invalid');
    const scope = `${client.appid}:${key}`;
    const temporaryScope = `${client.appid}:${temporaryKey}`;
    if (running.has(scope)) throw new DraftSyncError('busy');
    running.add(scope);
    try {
        await client.ensureAccount();
        const cover = await resolveImageURL(meta.cover);
        const dimensions = await imageDimensions(cover);
        const crops = defaultCrops(dimensions.width, dimensions.height);
        const article = {
            articleType: 'news' as const,
            title: meta.title,
            author: meta.author,
            digest,
            content,
            originUrl: meta.origin || null,
            commentOpen: false,
            coverMediaID: await uploadCover(client, new URL(cover)),
            coverCrop: crops.wide,
            thumbnailCrop: crops.square,
        };
        const signature = JSON.stringify(article);
        let saved = links.getItem(scope) ?? links.getItem(temporaryScope);
        if (scope !== temporaryScope && saved && !links.getItem(scope)) {
            links.setItem(scope, saved);
            links.deleteItem(temporaryScope);
            await Memorized.save();
        }
        if (resolution === 'new') saved = undefined;
        if (saved?.pending) {
            const matches: string[] = [];
            for (let offset = 0; offset < 100; offset += 20) {
                const page = await client.getDrafts(offset, 20);
                for (const draft of page.drafts) {
                    if (
                        draft.updateTime.getTime() <
                        saved.pending.since - 60000
                    )
                        continue;
                    if (
                        draft.articles.length === 1 &&
                        (await fingerprint(draft.articles[0])) ===
                            saved.pending.fingerprint
                    )
                        matches.push(draft.id);
                }
                if (offset + page.drafts.length >= page.total) break;
            }
            validate();
            if (matches.length !== 1) throw new DraftSyncError('uncertain');
            saved = {
                id: matches[0],
                signature: saved.signature,
                remote: saved.pending.fingerprint,
            };
            links.setItem(scope, saved);
            await Memorized.save();
        }
        if (saved?.id) {
            let remote: WeixinArticle[];
            try {
                remote = await client.getDraft(saved.id);
            } catch (error) {
                if (
                    error instanceof WeixinAPIError &&
                    [40007, 46001].includes(error.code)
                )
                    throw new DraftSyncError('missing');
                throw error;
            }
            const remoteSignature =
                remote.length === 1 ? await fingerprint(remote[0]) : '';
            if (
                resolution !== 'overwrite' &&
                (!saved.remote || remoteSignature !== saved.remote)
            )
                throw new DraftSyncError('conflict');
            validate();
            if (
                saved.signature === signature &&
                remoteSignature === saved.remote
            )
                return { id: saved.id, updated: false, unchanged: true };
        }
        validate();
        const pending = {
            since: Date.now(),
            fingerprint: await fingerprint(article),
        };
        if (!saved?.id) {
            links.setItem(scope, { signature, pending });
            await Memorized.save();
        }
        try {
            validate();
        } catch (error) {
            if (!saved?.id) {
                links.deleteItem(scope);
                await Memorized.save();
            }
            throw error;
        }
        let id: string;
        try {
            if (saved?.id) {
                await client.updateDraft(saved.id, 0, article);
                id = saved.id;
            } else id = await client.createDraft(article);
            if (!id) throw new DraftSyncError('uncertain');
        } catch (error) {
            if (!saved?.id && error instanceof WeixinAPIError) {
                links.deleteItem(scope);
                await Memorized.save();
            }
            if (!saved?.id && !(error instanceof WeixinAPIError))
                throw new DraftSyncError('uncertain');
            throw error;
        }
        links.setItem(scope, { id, signature });
        if (scope !== temporaryScope) links.deleteItem(temporaryScope);
        await Memorized.save();
        // Fetch the server's normalized content before trusting subsequent updates.
        const confirmed = await client.getDraft(id);
        const remote =
            confirmed.length === 1
                ? await fingerprint(confirmed[0])
                : undefined;
        links.setItem(scope, { id, signature, remote });
        if (scope !== temporaryScope) links.deleteItem(temporaryScope);
        await Memorized.save();
        return { id, updated: !!saved?.id, unchanged: false };
    } finally {
        running.delete(scope);
    }
}
