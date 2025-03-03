import { assert } from "./Debug";

export class RequestFailedError extends Error {
    status: number;
    constructor(r: Response) {
        super(`Request failed with status: ${r.status}`);
        this.status = r.status;
        this.name = 'APIRequestFailedError';
    }
}

export enum GetIPMethod {
    ipChaxun,
    ipify
}

export async function getIP(method: GetIPMethod) {
    let r: Response, ip: string;
    switch (method) {
        case GetIPMethod.ipChaxun:
            r = await fetch('https://2025.ipchaxun.com/', 
                { signal: AbortSignal.timeout(2000) });
            if (!r.ok) throw new Error();
            ip = (await r.json()).ip;
            break;
        case GetIPMethod.ipify:
            r = await fetch('https://api.ipify.org/?format=json', 
                { signal: AbortSignal.timeout(2000) });
            if (!r.ok) throw new Error();
            ip = (await r.json()).ip;
            break;
    }
    assert(typeof ip == 'string');
    return ip;
}
