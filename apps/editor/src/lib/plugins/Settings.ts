import { Memorized } from '$lib/config/Memorized.svelte';
import { BaseDirectory, exists, mkdir, readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { appConfigDir } from '@tauri-apps/api/path';
import * as z from 'zod/v4-mini';

export const pluginDefinitions = [
    { id: 'forwarding', name: '服务器转发' },
    { id: 'history', name: '往期回顾' },
    { id: 'metadata', name: '微信文章信息' },
    { id: 'drafts', name: '草稿箱' },
] as const;
export type PluginID = typeof pluginDefinitions[number]['id'];
const definition = z.object({forwarding: z.boolean(), history: z.boolean(), metadata: z.boolean(), drafts: z.boolean()});
export const plugins = Memorized.$('optional-plugins', definition,
    { forwarding: false, history: false, metadata: false, drafts: false });
const filename = 'weixin-plugins.json';

Memorized.onInitialize(async () => {
    try {
        if (await exists(filename, {baseDir: BaseDirectory.AppConfig})) {
            plugins.set(z.parse(definition, JSON.parse(await readTextFile(filename, {baseDir: BaseDirectory.AppConfig}))));
        } else if (await exists('memorized.json', {baseDir: BaseDirectory.AppConfig})) {
            const previous = JSON.parse(await readTextFile('memorized.json', {baseDir: BaseDirectory.AppConfig}));
            if (!previous['optional-plugins'] && previous['weixin-network']?.mode === 'ssh')
                plugins.set({...plugins.get(), forwarding: true});
        }
    } catch (error) { console.error('Cannot load plugin switches', error); }
    let timer: ReturnType<typeof setTimeout>;
    plugins.subscribe(value => {
        clearTimeout(timer);
        timer = setTimeout(async () => {
            try {
                await mkdir(await appConfigDir(), {recursive: true});
                await writeTextFile(filename, JSON.stringify(value), {baseDir: BaseDirectory.AppConfig});
            } catch (error) { console.error('Cannot save plugin switches', error); }
        }, 500);
    });
});
