
import { Memorized } from "$lib/config/Memorized.svelte";
import { Debug } from "$lib/Debug";
import { fetch, type ClientOptions } from "@tauri-apps/plugin-http";
import * as z from "zod/v4-mini";

const ReverseProxyData = z.object({
    url: z.httpUrl(),
    credential: z.union([
        z.object({
            type: z.literal('none'),
        }),
        z.object({
            type: z.literal('basic'),
            username: z.string(),
            password: z.string()
        }),
    ]),
});

type ReverseProxyData = z.infer<typeof ReverseProxyData>;

const proxies = Memorized.$dict('weixin-reverse-proxies', z.string(), ReverseProxyData);

export class ReverseProxyClient {
    readonly #data: ReverseProxyData;
    #name: string;

    static getNames() {
        return [...proxies.get().keys()];
    }

    static delete(name: string) {
        return proxies.deleteItem(name);
    }

    constructor(name: string) {
        let data = $state(proxies.getItem(name));
        if (!data) {
            data = { url: 'https://api.weixin.qq.com/cgi-bin/', credential: { type: 'none' } };
            proxies.setItem(name, data);
        }
        this.#data = data;
        this.#name = name;
    }

    get name() {
        return this.#name;
    }

    get url() {
        return this.#data.url;
    }

    set url(x) {
        this.#data.url = x;
    }

    get credential() {
        return this.#data.credential;
    }

    set credential(x) {
        this.#data.credential = x;
    }

    rename(to: string) {
        const map = proxies.get();
        Debug.assert(!map.has(to));
        map.set(to, this.#data);
        map.delete(this.#name);
        this.#name = to;
        proxies.markChanged();
    }

    async fetch(
        endpoint: string, init?: (RequestInit & ClientOptions) | undefined
    ): Promise<Response> {
        let auth: string | undefined;
        switch (this.credential.type) {
            case "none":
                break;
            case "basic":
                auth = 'Basic ' + btoa(`${this.credential.username}:${this.credential.password}`);
                break;
            default:
                Debug.never(this.credential);
        }
        const url = new URL(endpoint, this.url);
        console.log('requesting via reverse proxy', url);
        return await fetch(url, {
            ...(init ?? {}),
            headers: {
                ...(init?.headers ?? {}),
                ...(auth ? {
                    'Authorization': auth
                } : {})
            }
        });
    }
}
