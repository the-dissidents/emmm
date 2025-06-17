import { assert } from "./Debug";
// import { fetch } from '@tauri-apps/plugin-http';
import imageCompression from 'browser-image-compression';
import { readFile } from "@tauri-apps/plugin-fs";
import mime from 'mime/lite';

export class RequestFailedError extends Error {
    status: number;
    constructor(r: Response) {
        super(`Request failed with status: ${r.status}`);
        this.status = r.status;
        this.name = 'APIRequestFailedError';
    }
}

export enum GetIPMethod {
    ipinfo,
    ipify
}

export async function getIP(method: GetIPMethod) {
    let r: Response, ip: string;
    switch (method) {
        case GetIPMethod.ipinfo:
            r = await fetch('https://ipinfo.io/json', 
                { signal: AbortSignal.timeout(2000) });
            if (!r.ok) throw new Error();
            ip = (await r.json()).ip;
            console.log(ip);
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

export function cssPath(el: Element) {
    const path = [];
    while (true) {
        let selector = el.nodeName.toLowerCase();
        if (el.id) {
            selector += '#' + el.id;
            path.unshift(selector);
            break;
        } else {
            let sib = el, nth = 1;
            while (sib.previousElementSibling) {
                sib = sib.previousElementSibling;
                nth++;
            }
            selector += ":nth-child(" + nth + ")";
        }
        path.unshift(selector);
        if (!el.parentElement) break;
        el = el.parentElement;
    }
    return path.join(' > ');
}

export async function readUrl(url: URL) {
    console.log(url);
    if (url.protocol == 'file:') {
        return new Blob([await readFile(url)], 
            { type: mime.getType(url.href) ?? undefined });
    }
    
    let r = await fetch(url);
    if (!r.ok) throw new RequestFailedError(r);
    return await r.blob();
}

export async function loadImage(url: URL, maxSizeMB?: number, maxWidth = 1920) {
    let file = new File([await readUrl(url)], url.href, 
        { type: mime.getType(url.href) ?? undefined });
    // TODO: use a Rust implementation
    return maxSizeMB ? await imageCompression(file, { 
        maxSizeMB, maxWidthOrHeight: maxWidth,
        useWebWorker: true
    }) : file;
}