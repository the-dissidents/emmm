import { get, writable } from 'svelte/store';
import { BaseDirectory, exists, mkdir, readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { appConfigDir } from '@tauri-apps/api/path';
import { Memorized } from '$lib/config/Memorized.svelte';
import * as z from 'zod/v4-mini';

const serverDef = z.object({
    id: z.string(), name: z.string(), host: z.string(), username: z.string(),
    sshPort: z.number(), identityFile: z.string(), hostKeys: z.array(z.string()),
});
export type WeixinServer = z.infer<typeof serverDef>;
export const weixinServers = writable<WeixinServer[]>([]);
export const serversReady = writable(false);
const filename = 'weixin-servers.json';

export async function saveWeixinServers(servers: WeixinServer[]) {
    await mkdir(await appConfigDir(), { recursive: true });
    if (await exists(filename, { baseDir: BaseDirectory.AppConfig })) {
        await writeTextFile(filename + '.bak', await readTextFile(filename,
            { baseDir: BaseDirectory.AppConfig }), { baseDir: BaseDirectory.AppConfig });
    }
    await writeTextFile(filename, JSON.stringify(servers), { baseDir: BaseDirectory.AppConfig });
    weixinServers.set(servers);
}

export function currentWeixinServer(id: string) {
    return get(weixinServers).find(server => server.id === id);
}

Memorized.onInitialize(async () => {
    try {
        if (await exists(filename, { baseDir: BaseDirectory.AppConfig })) {
            const servers = z.parse(z.array(serverDef), JSON.parse(await readTextFile(filename,
                { baseDir: BaseDirectory.AppConfig })));
            weixinServers.set(servers);
        }
    } catch (error) {
        console.error('Cannot load saved servers', error);
    } finally {
        serversReady.set(true);
    }
});
