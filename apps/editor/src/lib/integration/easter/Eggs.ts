import { Command } from '@tauri-apps/plugin-shell';

export async function getVoices() {
    const result = await Command.create("get-voices", ['-v', '?']).execute();
    const list = result.stdout.split('\n').flatMap((x) => x.match(/^.+?(?= {2,})/)?.[0] ?? []);
    return list;
}

export async function say(voice: string, s: string) {
    await Command.create("say", ['-v', voice, s]).execute();
}
