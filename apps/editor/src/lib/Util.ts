import { assert } from "./Debug";
import { fetch } from '@tauri-apps/plugin-http';
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

export const DOMUtil = {
    isHtmlElementCrossRealm(obj: Element): obj is HTMLElement {
        return !!(
            obj &&
            typeof obj === 'object' &&
            obj.nodeType === 1 &&
            obj.ownerDocument &&
            typeof obj.nodeName === 'string'
        );
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

/** T must not be a function type */
export function unwrap<T>(x: T | (() => T)) {
    if (typeof x === 'function') return (x as () => T)();
    return x;
}

export type ProgressReporter = (v: number, total: number) => void;
