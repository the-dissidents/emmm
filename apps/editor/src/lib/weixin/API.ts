import { get, readonly, writable, type Readable } from "svelte/store";
import { Settings } from "../Settings";
import { fetch } from '@tauri-apps/plugin-http';
import { RequestFailedError } from "../Util";
import { assert } from "../Debug";
import { BaseDirectory, writeFile } from "@tauri-apps/plugin-fs";
import { appLocalDataDir, join } from "@tauri-apps/api/path";

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

let appid = writable<string>('');
let secret = writable<string>('');
let stableToken = writable<string>('');
let expireTime = new Date();

let smallImageCache = new Map<string, string>();
let assetCache = new Map<string, string>();

Settings.onInitialized(() => {
    appid.set(Settings.get('weixinAppId'));
    secret.set(Settings.get('weixinAppSecret'));
    smallImageCache = new Map(Settings.get('weixinSmallImageCache'));
    assetCache = new Map(Settings.get('weixinAssetCache'));

    appid.subscribe((x) => Settings.set('weixinAppId', x));
    secret.subscribe((x) => Settings.set('weixinAppSecret', x));
});

export const Weixin = {
    autoFetchToken: false,

    get appid() {
        return appid;
    },
    get secret() {
        return secret;
    },
    get stableToken(): Readable<string> {
        return readonly(stableToken);
    },
    get tokenOk(): boolean {
        return stableToken && expireTime.getTime() > Date.now();
    },
    /**
     * @param forced If true, forces the fetching of the token. Note this does NOT force Weixin to update its token.
     * @returns The fetched stable token.
     */
    async fetchToken(forced = false) {
        if (!forced && this.tokenOk)
            return get(stableToken);
        if (!get(appid) || !get(secret)) 
            throw new WeixinBadCredentialError();
        const r = await fetch('https://api.weixin.qq.com/cgi-bin/stable_token', {
            method: 'POST',
            body: JSON.stringify({
                "grant_type": "client_credential",
                "appid": get(appid),
                "secret": get(secret)
            })
        });
        if (!r.ok) throw new RequestFailedError(r);
        let json = await r.json();
        if (json.errcode) throw new WeixinAPIError(json);
        const token = json.access_token as string;
        stableToken.set(token);
        // slightly reduce the lifetime to avoid invalid tokens
        expireTime = new Date(Date.now() + (<number>json.expires_in - 10) * 1000);
        return token;
    },

    async getAssets(type: WeixinAssetType, from: number, count = 20) {
        if (!this.tokenOk && (!this.autoFetchToken || await this.fetchToken()))
            throw new WeixinInvalidTokenError();
        const r = await fetch(
            'https://api.weixin.qq.com/cgi-bin/material/batchget_material?'
            + new URLSearchParams({access_token: get(stableToken)}),
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
    },

    async getDrafts(from: number, count = 20) {
        if (!this.tokenOk && (!this.autoFetchToken || await this.fetchToken()))
            throw new WeixinInvalidTokenError();
        const r = await fetch(
            'https://api.weixin.qq.com/cgi-bin/draft/batchget?'
            + new URLSearchParams({access_token: get(stableToken)}),
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
    },

    async writeDraftArticle(id: string, index: number, article: WeixinDraftArticle) {
        if (!this.tokenOk && (!this.autoFetchToken || await this.fetchToken()))
            throw new WeixinInvalidTokenError();
        const r = await fetch(
            'https://api.weixin.qq.com/cgi-bin/draft/update?'
            + new URLSearchParams({access_token: get(stableToken)}),
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
    },

    async downloadAsset(id: string, name: string, force = false) {
        if (!force && assetCache.has(id))
            return assetCache.get(id)!;
        if (!this.tokenOk && (!this.autoFetchToken || await this.fetchToken()))
            throw new WeixinInvalidTokenError();
        
        console.log('downloadAsset', id, name, force);
        let path: string;
        try {
            const r = await fetch(
                'https://api.weixin.qq.com/cgi-bin/material/get_material?'
                + new URLSearchParams({access_token: get(stableToken)}),
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
        assetCache.set(id, path);
        Settings.set('weixinAssetCache', [...assetCache.entries()]);
        return path;
    },

    get smallImageCache(): ReadonlyMap<string, string> {
        return smallImageCache;
    },
    /**
     * @param blob Image data. PNG and JPEGs are supported.
     * @param name We cache the uploaded URL by this name. Subsequent calls with that name will simply return that URL unless `force` is set to true. This name is also used in the FormData as a filename, and to ensure Weixin recognizes the format, you should end it with a correct extension. (TODO: should be handled better)
     * @param [force=false] Force re-upload of the image even if it is in the cache.
     * @returns Generated URL of the uploaded image, starting with `http://mmbiz.qpic.cn/mmbiz/`. Note that it cannot be used outside pages published in Weixin.
     */
    async uploadSmallImage(blob: Blob, name: string, force = false) {
        if (!force && smallImageCache.has(name))
            return smallImageCache.get(name)!;

        if (!this.tokenOk && (!this.autoFetchToken || await this.fetchToken()))
            throw new WeixinInvalidTokenError();
        const form = new FormData();
        form.append('media', blob, name);
        const r = await fetch(
            'https://api.weixin.qq.com/cgi-bin/media/uploadimg?'
            + new URLSearchParams({access_token: get(stableToken)}),
        {
            method: 'POST',
            body: form
        });
        if (!r.ok) throw new RequestFailedError(r);
        let json = await r.json();
        if (json.errcode) throw new WeixinAPIError(json);
        const url = json.url as string;
        smallImageCache.set(name, url);
        Settings.set('weixinSmallImageCache', [...smallImageCache.entries()]);
        return url;
    }
}