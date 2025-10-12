import { Channel, invoke } from "@tauri-apps/api/core";

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
    async compressImage(path: string, maxSize: number) {
        const buf = await invoke<ArrayBuffer>('compress_image', {path, maxSize});
        return new Blob([buf], {type: 'image/jpeg'});
    }
}