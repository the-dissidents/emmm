import { get, readonly, writable, type Readable } from "svelte/store";
import { fetch } from '@tauri-apps/plugin-http';
import { RequestFailedError } from "$lib/Util";
import { assert, Debug } from "$lib/Debug";
import { BaseDirectory, writeFile } from "@tauri-apps/plugin-fs";
import { appLocalDataDir, join } from "@tauri-apps/api/path";
import { Memorized } from "$lib/config/Memorized.svelte";
import { type FileHash } from "$lib/RustAPI";

import * as z from "zod/v4-mini";

const accountDataDef = z.object({
    appid: z.string(),
    secret: z.string(),
    assetCache: z.array(z.tuple([z.string(), z.string()])),
});
type AccountData = z.infer<typeof accountDataDef>;

const accounts = Memorized.$dict('weixinAccounts', z.string(), accountDataDef);
const smallImageCache = Memorized.$dict('weixinSmallImageCacheV2', z.string(), z.string());

export type WeixinAssetType = 'image' | 'video' | 'voice';

export type WeixinAsset = {
    id: string,
    name: string,
    type: WeixinAssetType,
    updateTime: Date,
    internalUrl: string
};

export type WeixinNewsArticle = {
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

export type WeixinPictureArticle = {
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

export type WeixinArticle = WeixinNewsArticle | WeixinPictureArticle;
export type WeixinPublication = {
    id: string,
    articles: WeixinArticle[],
    updateTime: Date,
};

export enum WeixinPublicationStatus {
    /** the publication was released successfully */
    Released = 0,
    /** the publication is in the process of being released */
    Releasing = 1,
    /** the release process has failed for an original publication */
    FailedOriginal = 2,
    /** the release process has failed for a non-original publication */
    FailedNormal = 3,
    /** the publication did not pass the censorship and has not been released */
    Censored = 4,
    /** the publication was deleted by the user after being released */
    Deleted = 5,
    /** the publication was banned after being released */
    Banned = 6,
}

function parseArticle(json: any): WeixinArticle {
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

function makeArticle(obj: WeixinArticle): any {
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

function initAccountData(): AccountData {
    return { appid: '', secret: '', assetCache: [] };
}

export class WeixinClient {
    #data: AccountData;
    readonly #stableToken = writable('');

    #name: string;
    #expireTime = new Date(0);
    #assetCache = new Map<string, string>();
    autoFetchToken = false;

    static getNames() {
        return [...accounts.get().keys()];
    }

    constructor(name = 'default') {
        this.#name = name;

        let entry = accounts.getItem(this.#name);
        if (!entry) {
            entry = initAccountData();
            accounts.setItem(this.#name, entry);
        }
        this.#assetCache = new Map(entry.assetCache);
        this.#data = entry;
    }

    get appid() {
        return this.#data.appid;
    }

    set appid(v: string) {
        this.#data.appid = v;
        this.#syncCache();
    }

    get secret() {
        return this.#data.secret;
    }

    set secret(v: string) {
        this.#data.secret = v;
        this.#syncCache();
    }

    get name() {
        return this.#name;
    }

    rename(to: string) {
        const map = accounts.get();
        const old = this.#name;
        Debug.assert(!map.has(to));
        map.set(to, this.#data);
        this.#name = to;
        map.delete(old);
        accounts.set(map);
    }

    deleteAndSwitch(to: string) {
        accounts.deleteItem(this.name);
        this.#name = to;

        let entry = accounts.getItem(to);
        if (!entry) {
            entry = initAccountData();
            accounts.setItem(to, entry);
        }
        this.#assetCache = new Map(entry.assetCache);
        this.#data = entry;
    }

    #syncCache() {
        this.#data.assetCache = [...this.#assetCache.entries()];
        accounts.setItem(this.name, this.#data);
    }

    get stableToken(): Readable<string> {
        return readonly(this.#stableToken);
    }

    get tokenOk(): boolean {
        return get(this.#stableToken) !== '' && this.#expireTime.getTime() > Date.now();
    }

    async #rawExec(path: string, body: object, check = true) {
        if (check && !this.tokenOk && (!this.autoFetchToken || await this.fetchToken()))
            throw new WeixinInvalidTokenError();
        const t0 = performance.now();
        const r = await fetch(
            `https://api.weixin.qq.com/cgi-bin/${path}?`
            + new URLSearchParams({access_token: get(this.#stableToken)}),
        {
            method: 'POST',
            body: JSON.stringify(body)
        });
        console.log(`${path}: ${r.status} in ${(performance.now() - t0).toFixed(0)}ms`);
        if (!r.ok) throw new RequestFailedError(r);
        return r;
    }

    async #exec(path: string, body: object, check = true) {
        const r = await this.#rawExec(path, body, check);
        const json = await r.json();
        if (json.errcode) throw new WeixinAPIError(json);
        return json;
    }

    async fetchToken(forced = false) {
        if (!forced && this.tokenOk)
            return get(this.#stableToken);
        if (!this.appid || !this.secret)
            throw new WeixinBadCredentialError();

        const json = await this.#exec('stable_token', {
            "grant_type": "client_credential",
            "appid": this.appid,
            "secret": this.secret
        }, false);
        const token = json.access_token as string;
        this.#stableToken.set(token);
        this.#expireTime = new Date(Date.now() + (<number>json.expires_in - 10) * 1000);
        return token;
    }

    async getAssets(type: WeixinAssetType, from: number, count = 20) {
        const json = await this.#exec('material/batchget_material', {
            "type": type as string,
            "offset": from,
            "count": count
        });
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


    /**
     * Read from the list of unpublished drafts.
     */
    async getDrafts(from: number, count = 20) {
        const json = await this.#exec('draft/batchget', {
            "offset": from,
            "count": count,
            "no_content": 1
        });
        if (json.errcode) throw new WeixinAPIError(json);
        const total = json.total_count as number;
        const drafts: WeixinPublication[] = [...json.item].map((x) => ({
            id: x.media_id as string,
            articles: x.content.news_item.map((y: any) => parseArticle(y)),
            updateTime: new Date(x.update_time * 1000),
        }));
        return { total, drafts };
    }

    /**
     * Create a draft consisting of one or more articles.
     * @returns ID of the created draft.
     */
    async createDraft(...articles: WeixinArticle[]) {
        const json = await this.#exec('draft/add', {
            "articles": articles.map(makeArticle)
        });
        return json.media_id as string;
    }

    /**
     * Update an existing draft.
     * @param id draft ID
     * @param index index of the article in the draft to update
     * @returns `true`.
     */
    async updateDraft(id: string, index: number, article: WeixinArticle) {
        await this.#exec('draft/update', {
            "media_id": id,
            "index": index,
            // despite the name, this should be a single object instead of an array
            "articles": makeArticle(article)
        });
        return true;
    }

    /**
     * Read from the list of publications.
     */
    async getPublications(from: number, count = 20) {
        const json = await this.#exec('freepublish/batchget', {
            "offset": from,
            "count": count,
            "no_content": 1
        });
        const total = json.total_count as number;
        const items: WeixinPublication[] = [...json.item].map((x) => ({
            id: x.article_id as string,
            articles: x.content.news_item.map((y: any) => parseArticle(y)),
            updateTime: new Date(x.update_time * 1000),
        }));
        return { total, items };
    }

    async downloadAsset(id: string, name: string, force = false) {
        if (!force && this.#assetCache.has(id))
            return this.#assetCache.get(id)!;
        if (!this.tokenOk && (!this.autoFetchToken || await this.fetchToken()))
            throw new WeixinInvalidTokenError();

        console.log('downloadAsset', id, name, force);
        const r = await this.#rawExec('material/get_material', { "media_id": id });
        const filename = `${id}-${[...name].filter((x) => /[a-zA-Z0-9.]/.test(x)).join('')}`;
        await writeFile(filename,
            new Uint8Array(await r.arrayBuffer()), { baseDir: BaseDirectory.AppLocalData });
        const path = await join(await appLocalDataDir(), filename);
        console.log('downloadAsset done', id, name);

        this.#assetCache.set(id, path);
        this.#syncCache();
        return path;
    }

    static async getSmallImageCacheUrl(hash: FileHash) {
        return smallImageCache.getItem(hash);
    }

    async uploadSmallImage(blob: Blob, name: string, key: string, force = false) {
        if (!force && smallImageCache.get().has(key))
            return smallImageCache.getItem(key)!;

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
        if (key !== null) smallImageCache.setItem(key, url);
        return url;
    }
}
