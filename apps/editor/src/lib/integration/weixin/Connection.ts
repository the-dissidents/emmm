import { Memorized } from '$lib/config/Memorized.svelte';
import { invoke } from '@tauri-apps/api/core';
import * as z from 'zod/v4-mini';

const profileDefinition = z.object({
    id: z.string(),
    name: z.string(),
    endpoint: z.string(),
    username: z.string(),
    password: z.optional(z.string()),
    certificate: z.string(),
    revision: z.string(),
});
export type WeixinProxy = z.infer<typeof profileDefinition>;
export const proxies = Memorized.$(
    'weixin-proxies',
    z.array(profileDefinition),
    []
);
export const connection = Memorized.$(
    'weixin-connection',
    z.object({ mode: z.enum(['direct', 'relay']), profileId: z.string() }),
    { mode: 'direct', profileId: '' }
);

export function selectedProxy() {
    return proxies
        .get()
        .find((proxy) => proxy.id === connection.get().profileId);
}

export type ProxySettings = {
    endpoint: string;
    username: string;
    password: string;
    certificate: string;
};

function settings(proxy: WeixinProxy): ProxySettings {
    return {
        endpoint: proxy.endpoint,
        username: proxy.username,
        password: proxy.password ?? '',
        certificate: proxy.certificate,
    };
}

export function proxySettings() {
    if (connection.get().mode === 'direct') return undefined;
    const proxy = selectedProxy();
    if (!proxy) throw new Error('proxy-required');
    return settings(proxy);
}

export function connectionKey() {
    return JSON.stringify([connection.get(), selectedProxy()]);
}

export async function saveProxy(options: {
    profileId: string;
    name: string;
    serviceUrl: string;
    username: string;
    password: string;
    certificate: string;
}) {
    const { profileId, name, serviceUrl, ...credentials } = options;
    const proxy = z.parse(profileDefinition, {
        ...(await invoke<ProxySettings>('validate_weixin_proxy', {
            settings: { ...credentials, endpoint: serviceUrl },
        })),
        id: profileId,
        name,
        revision: crypto.randomUUID(),
    });
    proxies.set([
        ...proxies.get().filter((item) => item.id !== proxy.id),
        proxy,
    ]);
    await Memorized.save();
    return proxy;
}

export async function deleteProxy(profileId: string) {
    proxies.set(proxies.get().filter((proxy) => proxy.id !== profileId));
    if (connection.get().profileId === profileId)
        connection.set({ mode: 'relay', profileId: '' });
    await Memorized.save();
}

export function testProxy(profileId: string) {
    const proxy = proxies.get().find((proxy) => proxy.id === profileId);
    if (!proxy) throw new Error('proxy-required');
    return invoke<void>('test_weixin_proxy', { settings: settings(proxy) });
}

export function proxyRequest(path: string, token: string, body: object) {
    return invoke<Record<string, any>>('proxy_weixin_request', {
        settings: proxySettings(),
        path,
        token,
        body,
    });
}

export async function proxyUpload(
    token: string,
    kind: 'body' | 'cover',
    blob: Blob,
    name: string
) {
    const settings = proxySettings();
    const bytes = [...new Uint8Array(await blob.arrayBuffer())];
    return invoke<{
        errcode?: number;
        errmsg?: string;
        media_id?: string;
        url?: string;
    }>('proxy_weixin_upload', {
        settings,
        token,
        kind,
        bytes,
        name,
    });
}
