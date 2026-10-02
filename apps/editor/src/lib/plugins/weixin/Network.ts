import { invoke } from '@tauri-apps/api/core';
import { fetch, type ClientOptions } from '@tauri-apps/plugin-http';
import { get } from 'svelte/store';
import { _ } from 'svelte-i18n';
import * as z from 'zod/v4-mini';
import { Memorized } from '$lib/config/Memorized.svelte';
import { getIP, GetIPMethod } from '$lib/Util';
import { plugins } from '../Settings';
import { currentWeixinServer, type WeixinServer } from './Servers';

const networkDef = z.object({
    mode: z.enum(['direct', 'ssh']),
    sshServer: z.string(),
    localPort: z.number(),
});

export type WeixinNetworkSettings = z.infer<typeof networkDef>;
export const weixinNetwork = Memorized.$('weixin-network', networkDef, {
    mode: 'direct',
    sshServer: '',
    localPort: 18781,
});

Memorized.onInitialize(() => {
    let pendingSave: ReturnType<typeof setTimeout>;
    weixinNetwork.subscribe(() => {
        clearTimeout(pendingSave);
        pendingSave = setTimeout(() => {
            Memorized.save().catch(error => console.error('Cannot save connection settings', error));
        }, 500);
    });
});

export class UntrustedWeixinServerError extends Error {
    constructor(public server: WeixinServer) {
        super('Server fingerprint is not trusted');
    }
}

async function networkOptions(settings: WeixinNetworkSettings): Promise<ClientOptions> {
    const t = get(_);
    if (!plugins.get().forwarding || settings.mode === 'direct') return {};

    if (settings.mode === 'ssh') {
        const server = currentWeixinServer(settings.sshServer);
        if (!server)
            throw new Error(t('weixin.network.missing-server'));
        if (!Number.isInteger(settings.localPort) || settings.localPort < 1024 || settings.localPort > 65535)
            throw new Error(t('weixin.network.invalid-port'));
        if (!server.hostKeys.length) throw new UntrustedWeixinServerError(server);
        try {
            await invoke('ensure_weixin_tunnel', {
                server,
                port: settings.localPort,
            });
        } catch (error) {
            throw new Error(`${t('weixin.network.ssh-error')}: ${error}`);
        }
        return { proxy: { all: `socks5h://127.0.0.1:${settings.localPort}` }, connectTimeout: 12000 };
    }

    throw new Error('Unknown connection mode');
}

/** All Weixin requests, including multipart uploads, share the selected route. */
export const weixinFetch: typeof fetch = async (input, init) => {
    const options = await networkOptions({ ...weixinNetwork.get() });
    // A failed forwarded request must stay failed, never retry through the local network.
    return fetch(input, { ...init, ...options });
};

export async function getWeixinPublicIP() {
    const options = await networkOptions({ ...weixinNetwork.get() });
    const request: typeof fetch = (input, init) => fetch(input, { ...init, ...options });
    try {
        return await getIP(GetIPMethod.ip3322, request);
    } catch {
        return await getIP(GetIPMethod.ipinfo, request);
    }
}
