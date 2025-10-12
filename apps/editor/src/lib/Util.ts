import { assert } from "./Debug";
import { fetch } from '@tauri-apps/plugin-http';
import { readFile } from "@tauri-apps/plugin-fs";
import mime from 'mime/lite';
import { RustAPI } from "./RustAPI";
import { path } from "@tauri-apps/api";
import * as fs from "@tauri-apps/plugin-fs";

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

export const DOMUtil = {
    pathOf(el: Element) {
        const path: string[] = [];
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
    },
    replaceTagName(elem: Element, name: string, doc: Document) {
        try {
            let newElem = doc.createElement(name);
            while (elem.firstChild) {
                newElem.appendChild(elem.firstChild); 
            }
            for (let i = elem.attributes.length - 1; i >= 0; --i) {
                newElem.attributes.setNamedItem(elem.attributes[i].cloneNode() as Attr);
            }
            assert(elem.parentNode !== null);
            elem.parentNode?.replaceChild(newElem, elem);
        } catch (e) {
            console.error('replaceTagName:', elem.tagName, '->', name, e);
        }
    },
    parseCssString(cssString: string): string {
        if (!cssString || cssString.length < 2) return "";
        const quote = cssString[0];
        if ((quote !== '"' && quote !== "'") || cssString[cssString.length - 1] !== quote) {
            throw new Error("Invalid CSS string: missing quotes");
        }
        let raw = cssString.slice(1, -1).replace(/\\\r\n|\\\n|\\\r/g, '');
        return raw.replace(/\\([0-9a-fA-F]{1,6}[ \t\n\r\f]?|["'\\])/g, 
            (_match: string, esc: string): string => {
                if (/^[0-9a-fA-F]/.test(esc)) {
                    // Remove optional whitespace after hex
                    let hex = esc.trim();
                    let codepoint = parseInt(hex, 16);
                    return String.fromCodePoint(codepoint);
                }
                return esc;
            });
    }
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

export async function loadImage(url: URL, maxSizeMB?: number) {
    let file = new File([await readUrl(url)], url.href, 
        { type: mime.getType(url.href) ?? undefined });

    if (!maxSizeMB || 
        ((file.type == 'image/png' || file.type == 'image/jpeg') 
            && file.size < maxSizeMB * 1024 * 1024))
    {
        return file;
    }
    
    let filepath: string;
    if (url.protocol !== 'file:') {
        // save to local
        filepath = await path.join(
            await path.tempDir(), 
            crypto.randomUUID() + await path.extname(url.pathname));
        await fs.writeFile(filepath, file.stream());
    } else {
        filepath = url.pathname;
    }

    return RustAPI.compressImage(filepath, maxSizeMB * 1024 * 1024);
}