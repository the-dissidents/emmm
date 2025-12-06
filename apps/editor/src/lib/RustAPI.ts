import { Channel, invoke } from "@tauri-apps/api/core";
import { BinaryReader } from "./details/BinaryReader";
import { path } from "@tauri-apps/api";
import * as fs from "@tauri-apps/plugin-fs";
import mime from 'mime/lite';
import { readUrl } from "./Util";

type BackendEvent = {
    event: 'failed'
    data: {
        msg: string
    }
} | {
    event: 'inlined'
    data: {
        result: string
    }
} | {
    event: 'done',
    data: {}
}

type BackendEventKey = BackendEvent['event'];
type BackendEventData = {[E in BackendEvent as E['event']]: E['data']};
type BackendEventHandler<key extends BackendEventKey> = (data: BackendEventData[key]) => void;

class BackendError extends Error {
    constructor(msg: string) {
        super(msg);
        this.name = 'BackendError';
    }
}

function createChannel(handler: {[key in BackendEventKey]?: BackendEventHandler<key>}) {
    const channel = new Channel<BackendEvent>;
    channel.onmessage = (msg) => {
        let h = handler[msg.event];
        // 'as any' because a little quirk in TypeScript's inference system
        // a functor of type (A | B) => C obviously accepts A | B as the parameter
        // however, (A => C) | (B => C) will not accept it
        if (h) {
            h(msg.data as any);
            return;
        }

        switch (msg.event) {
        case 'failed':
            throw new BackendError(msg.data.msg);
        default:
            throw new Error('unhandled event: ' + msg.event);
        }
    }
    return channel;
}

export const RustAPI = {
    async compressImage(url: URL, maxSize: number) {
        let filepath = decodeURIComponent(url.pathname);
        if (url.protocol !== 'file:') {
            let file = new File([await readUrl(url)], url.href,
                { type: mime.getType(url.href) ?? undefined });
            // save to local
            filepath = await path.join(
                await path.tempDir(),
                crypto.randomUUID() + await path.extname(filepath));
            await fs.writeFile(filepath, file.stream());
        }

        const buf = await invoke<ArrayBuffer>('compress_image', {
            path: filepath, maxSize,
            supportedTypes: ['image/jpeg', 'image/png'],
            max_width: 1920
        });

        const reader = new BinaryReader(buf);
        const type = reader.readString();
        const ext = reader.readString();
        const data = reader.readToEnd();
        return {
            blob: new Blob([data], { type }),
            ext, mime: type
        };
    }
}
