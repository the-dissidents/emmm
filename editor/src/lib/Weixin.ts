import { get, readonly, writable, type Readable } from "svelte/store";
import { Settings } from "./Settings";
import { fetch } from '@tauri-apps/plugin-http';
import { RequestFailedError } from "./Util";

export type WeixinAssetType = 'image' | 'video' | 'voice';

export type WeixinAsset = {
    id: string,
    name: string,
    type: WeixinAssetType,
    updateTime: Date,
    internalUrl: string
};

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
    constructor(public readonly code: number) {
        super(`Weixin API returned with errcode: ${code}`);
        this.name = 'WeixinAPIError';
    }
}

let appid = writable<string>('');
let secret = writable<string>('');
let stableToken = writable<string>('');
let expireTime = new Date();

let smallImageCache = new Map<string, string>();

Settings.onInitialized(() => {
    appid.set(Settings.get('weixinAppId'));
    secret.set(Settings.get('weixinAppSecret'));
    smallImageCache = new Map(Settings.get('weixinSmallImageCache'));

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
        if (json.errcode) throw new WeixinAPIError(json.errcode);
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
        if (json.errcode) throw new WeixinAPIError(json.errcode);
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
    get smallImageCache(): ReadonlyMap<string, string> {
        return smallImageCache;
    },
    /**
     * @param blob Image data. PNG and JPEGs are supported.
     * @param name If specified, add the uploaded URL to a cache by that name. Subsequent calls with that name will simply return that URL, unless `force` is set to true.
     * @param [force=false] Force re-upload of the image even if it is in the cache.
     * @returns Generated URL of the uploaded image, starting with `http://mmbiz.qpic.cn/mmbiz/`. Note that it cannot be used outside pages published in Weixin.
     */
    async uploadSmallImage(blob: Blob, name?: string, force = false) {
        if (!force && name && smallImageCache.has(name))
            return smallImageCache.get(name);

        if (!this.tokenOk && (!this.autoFetchToken || await this.fetchToken()))
            throw new WeixinInvalidTokenError();
        const form = new FormData();
        form.append('media', blob);
        const r = await fetch(
            'https://api.weixin.qq.com/cgi-bin/media/uploadimg?'
            + new URLSearchParams({access_token: get(stableToken)}),
        {
            method: 'POST',
            body: form
        });
        if (!r.ok) throw new RequestFailedError(r);
        let json = await r.json();
        if (json.errcode) throw new WeixinAPIError(json.errcode);
        const url = json.url as string;
        if (name) {
            smallImageCache.set(name, url);
            Settings.set('weixinSmallImageCache', [...smallImageCache.entries()]);
        }
        return url;
    }
}