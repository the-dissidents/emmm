import { get, readonly, toStore, writable, type Readable } from "svelte/store";
import { fetch } from '@tauri-apps/plugin-http';
import { RequestFailedError } from "$lib/Util";
import { assert } from "$lib/Debug";
import { BaseDirectory, writeFile } from "@tauri-apps/plugin-fs";
import { appLocalDataDir, join } from "@tauri-apps/api/path";
import { Memorized } from "$lib/config/Memorized.svelte";

import * as z from "zod/v4-mini";

const accountDataDef = z.object({
    appid: z.string(),
    secret: z.string(),
    smallImageCache: z.array(z.tuple([z.string(), z.string()])),
    assetCache: z.array(z.tuple([z.string(), z.string()])),
});
type AccountData = z.infer<typeof accountDataDef>;

const accounts = Memorized.$dict('weixinAccounts', z.string(), accountDataDef);

function initAccountData(): AccountData {
    return { appid: '', secret: '', smallImageCache: [], assetCache: [] };
}

export type WeixinAssetType = 'image' | 'video' | 'voice';

export type WeixinAsset = {
    id: string,
    name: string,
    type: WeixinAssetType,
    updateTime: Date,
    internalUrl: string
};

export type WeixinDraftNewsArticle = {
    articleType: 'news',
    title: string,
    author: string,
    digest: string,
    coverMediaID: number,
    coverCrop: [x1: number, y1: number, x2: number, y2: number],
    thumbnailCrop: [x1: number, y1: number, x2: number, y2: number],
    content: string,
    /** 阅读原文链接 */
    originUrl: string | null,
    commentOpen: boolean,
};

export type WeixinDraftPictureArticle = {
    articleType: 'newspic',
    title: string,
    content?: string,
    commentOpen: boolean,
    coverMediaID: number,
    coverVersions: {
        [key in '2.35:1' | '16:9' | '1:1']?: [x1: number, y1: number, x2: number, y2: number]
    },
    imageMediaIDs: number[],
};

export type WeixinDraftArticle = WeixinDraftNewsArticle | WeixinDraftPictureArticle;
export type WeixinDraft = {
    id: string,
    articles: WeixinDraftArticle[],
    updateTime: Date,
};

function parseArticle(json: any): WeixinDraftArticle {
    if (json.article_type == 'news') {
        return {
            articleType: 'news',
            title: json.title,
            author: json.author,
            digest: json.digest,
            coverMediaID: json.thumb_media_id,
            coverCrop: [-1, -1, -1, -1], // TODO
            thumbnailCrop: [-1, -1, -1, -1],
            content: json.content,
            /** 阅读原文链接 */
            originUrl: json.content_source_url ?? null,
            commentOpen: json.need_open_comment > 0,
        }
    } else {
        assert(json.article_type == 'newspic');
        return {
            articleType: 'newspic',
            title: json.title,
            content: json.content,
            commentOpen: json.need_open_comment > 0,
            coverMediaID: json.thumb_media_id,
            coverVersions: {}, // TODO
            imageMediaIDs: [...json.image_info.image_list].map((x) => x.image_media_id),
        }
    }
}

function makeArticle(obj: WeixinDraftArticle): any {
    if (obj.articleType == 'news') {
        return {
            article_type: 'news',
            title: obj.title,
            author: obj.author,
            digest: obj.digest,
            thumb_media_id: obj.coverMediaID,
            content: obj.content,
            content_source_url: obj.originUrl ?? undefined,
            need_open_comment: obj.commentOpen ? 1 : 0,
        }
    } else {
        assert(obj.articleType == 'newspic');
        return {
            articleType: 'newspic',
            title: obj.title,
            content: obj.content,
            need_open_comment: obj.commentOpen ? 1 : 0,
            thumb_media_id: obj.coverMediaID,
        }
    }
}

export class WeixinBadCredentialError extends Error {
    constructor() {
        super(`No credentials or invalid credentials`);
        this.name = 'WeixinBadCredentialError';
    }
}

export class WeixinInvalidTokenError extends Error {
    constructor() {
        super(`No token acquired or it is expired`);
        this.name = 'WeixinInvalidTokenError';
    }
}

export class WeixinAPIError extends Error {
    code: number;
    msg: string;
    constructor(obj: {errcode: number, errmsg?: string}) {
        super(`Weixin API returned with errcode: ${
            obj.errcode}${
            obj.errmsg ? `[${obj.errmsg}]` : ''}`);
        this.code = obj.errcode;
        this.msg = obj.errmsg ?? '';
        this.name = 'WeixinAPIError';
    }
}

export class WeixinClient {
    private readonly data: AccountData;
    readonly #stableToken = writable('');
    #expireTime = new Date(0);
    #smallImageCache = new Map<string, string>();
    #assetCache = new Map<string, string>();
    autoFetchToken = false;

    readonly appid;
    readonly secret;

    constructor(readonly name = 'default') {
        const account = accounts.item(name);
        let entry = account.get();
        if (!entry) {
            entry = initAccountData();
            account.set(entry);
        }
        this.#smallImageCache = new Map(entry.smallImageCache);
        this.#assetCache = new Map(entry.assetCache);
        this.data = entry;

        this.appid = account.toNonoptional().field('appid');
        this.secret = account.toNonoptional().field('secret');
    }

    #syncCache() {
        this.data.smallImageCache = [...this.#smallImageCache.entries()];
        this.data.assetCache = [...this.#assetCache.entries()];
        accounts.item(this.name).set(this.data);
    }

    get stableToken(): Readable<string> {
        return readonly(this.#stableToken);
    }

    get tokenOk(): boolean {
        return get(this.#stableToken) !== '' && this.#expireTime.getTime() > Date.now();
    }

    get smallImageCache(): ReadonlyMap<string, string> {
        return this.#smallImageCache;
    }

    async fetchToken(forced = false) {
        if (!forced && this.tokenOk)
            return get(this.#stableToken);
        if (!get(this.appid) || !get(this.secret))
            throw new WeixinBadCredentialError();
        const r = await fetch('https://api.weixin.qq.com/cgi-bin/stable_token', {
            method: 'POST',
            body: JSON.stringify({
                "grant_type": "client_credential",
                "appid": this.appid.get(),
                "secret": this.secret.get()
            })
        });
        if (!r.ok) throw new RequestFailedError(r);
        let json = await r.json();
        if (json.errcode) throw new WeixinAPIError(json);
        const token = json.access_token as string;
        this.#stableToken.set(token);
        this.#expireTime = new Date(Date.now() + (<number>json.expires_in - 10) * 1000);
        return token;
    }

    async getAssets(type: WeixinAssetType, from: number, count = 20) {
        if (!this.tokenOk && (!this.autoFetchToken || await this.fetchToken()))
            throw new WeixinInvalidTokenError();
        const r = await fetch(
            'https://api.weixin.qq.com/cgi-bin/material/batchget_material?'
            + new URLSearchParams({access_token: get(this.#stableToken)}),
        {
            method: 'POST',
            body: JSON.stringify({
                "type": type as string,
                "offset": from,
                "count": count
            })
        });
        if (!r.ok) throw new RequestFailedError(r);
        let json = await r.json();
        if (json.errcode) throw new WeixinAPIError(json);
        const total = json.total_count as number;
        const assets: WeixinAsset[] = [...json.item].map((x) => ({
            type: type,
            id: x.media_id as string,
            name: x.name as string,
            updateTime: new Date(x.update_time * 1000),
            internalUrl: x.url as string
        }));
        return { total, assets };
    }

    async getDrafts(from: number, count = 20) {
        if (!this.tokenOk && (!this.autoFetchToken || await this.fetchToken()))
            throw new WeixinInvalidTokenError();
        const r = await fetch(
            'https://api.weixin.qq.com/cgi-bin/draft/batchget?'
            + new URLSearchParams({access_token: get(this.#stableToken)}),
        {
            method: 'POST',
            body: JSON.stringify({
                "offset": from,
                "count": count,
                "no_content": 1
            })
        });
        if (!r.ok) throw new RequestFailedError(r);
        let json = await r.json();
        if (json.errcode) throw new WeixinAPIError(json);
        const total = json.total_count as number;
        const drafts: WeixinDraft[] = [...json.item].map((x) => ({
            id: x.media_id as string,
            articles: x.content.news_item.map((y: any) => parseArticle(y)),
            updateTime: new Date(x.update_time * 1000),
        }));
        console.log(from, count, json, drafts);
        return { total, drafts };
    }

    async writeDraftArticle(id: string, index: number, article: WeixinDraftArticle) {
        if (!this.tokenOk && (!this.autoFetchToken || await this.fetchToken()))
            throw new WeixinInvalidTokenError();
        const r = await fetch(
            'https://api.weixin.qq.com/cgi-bin/draft/update?'
            + new URLSearchParams({access_token: get(this.#stableToken)}),
        {
            method: 'POST',
            body: JSON.stringify({
                "media_id": id,
                "index": index,
                "articles": makeArticle(article)
            })
        });
        if (!r.ok) throw new RequestFailedError(r);
        let json = await r.json();
        if (json.errcode) throw new WeixinAPIError(json);
        return true;
    }

    async downloadAsset(id: string, name: string, force = false) {
        if (!force && this.#assetCache.has(id))
            return this.#assetCache.get(id)!;
        if (!this.tokenOk && (!this.autoFetchToken || await this.fetchToken()))
            throw new WeixinInvalidTokenError();

        console.log('downloadAsset', id, name, force);
        let path: string;
        try {
            const r = await fetch(
                'https://api.weixin.qq.com/cgi-bin/material/get_material?'
                + new URLSearchParams({access_token: get(this.#stableToken)}),
            {
                method: 'POST',
                body: JSON.stringify({ "media_id": id })
            });
            console.log(r.status, r.statusText);
            if (!r.ok)
                throw new RequestFailedError(r);
            const filename = `${id}-${[...name].filter((x) => /[a-zA-Z0-9.]/.test(x)).join('')}`;
            await writeFile(filename,
                new Uint8Array(await r.arrayBuffer()), { baseDir: BaseDirectory.AppLocalData });
            path = await join(await appLocalDataDir(), filename);
        } catch (_) {
            path = '';
        }
        this.#assetCache.set(id, path);
        this.#syncCache();
        return path;
    }

    async uploadSmallImage(blob: Blob, name: string, key: string, force = false) {
        if (!force && this.#smallImageCache.has(name))
            return this.#smallImageCache.get(name)!;

        if (!this.tokenOk && (!this.autoFetchToken || await this.fetchToken()))
            throw new WeixinInvalidTokenError();
        const form = new FormData();
        form.append('media', blob, name);
        const r = await fetch(
            'https://api.weixin.qq.com/cgi-bin/media/uploadimg?'
            + new URLSearchParams({access_token: get(this.#stableToken)}),
        {
            method: 'POST',
            body: form
        });
        if (!r.ok) throw new RequestFailedError(r);
        let json = await r.json();
        if (json.errcode) throw new WeixinAPIError(json);
        const url = json.url as string;
        this.#smallImageCache.set(key, url);
        this.#syncCache();
        return url;
    }
}

export const Weixin = new WeixinClient();
