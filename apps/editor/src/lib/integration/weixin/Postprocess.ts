import { DOMUtil, type ProgressReporter } from "$lib/Util";

import { convertNewlines, inlineBeforeAfter, inlineCss } from "@the_dissidents/dom-css-inliner";
import { path } from "@tauri-apps/api";
import { convertFileSrc } from "@tauri-apps/api/core";
import * as fs from "@tauri-apps/plugin-fs";
import { Debug } from "$lib/Debug";
import { findBoundingRect } from "$lib/details/BoundingRect";
import { toCanvas } from "$lib/details/ElementToCanvas";
import { WeixinClient } from "./API.svelte";
import { Interface } from "$lib/Interface.svelte";
import { compileStyles } from "$lib/Render";
import { RustAPI } from "$lib/RustAPI";
import { Workspace } from "$lib/workspace/Workspace.svelte";

const CONVERT_TO_SECTION = new Set([
    'address', 'article', 'aside', 'blockquote', 'dd', 'div', 'dl', 'dt', 'fieldset',
    'figcaption', 'figure', 'footer', 'form', 'header',
    'li', 'main', 'nav', 'ol', 'pre', 'ul'
]);

const CONVERT_TO_SPAN = new Set([
    'abbr', 'acronym', 'b', 'bdo', 'big', 'cite', 'code', 'dfn', 'em', 'i',
    'kbd', 'output', 'q', 'samp', 'small', 'strong',  'time', 'tt', 'var',
    'mjk-chs', 'mjk-lat'
]);

const PRESERVE = new Set([
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'table', 'thead', 'tbody', 'tfoot', 'th', 'td', 'tr',
    'p', 'span', 'section', 'img', 'a', 'hr', 'br', 'sub', 'sup',
]);

async function prerenderElement(e: HTMLElement, width: number, height: number) {
    const id = crypto.randomUUID();
    const file = await path.join(await path.tempDir(), `prerender-${id}.png`);
    try {
        const blob = await toCanvas(e, width, height, devicePixelRatio);
        await fs.writeFile(file, new Uint8Array(await blob.arrayBuffer()));
    } catch (e) {
        console.warn(e);
        return null;
    }
    return file;
}

function findPrerenderRoots(win: Window, root: Element): HTMLElement[] {
    const result: HTMLElement[] = [];

    for (const child of root.children) {
        if (!DOMUtil.isHtmlElementCrossRealm(child)) continue;
        const style = win.getComputedStyle(child);
        if (style.getPropertyValue('--emmm-prerender').trim()) {
            result.push(child);
            continue;
        }

        result.push(...findPrerenderRoots(win, child));
    }

    return result;
}

export async function prerender(win: Window, doc: Document, progress?: ProgressReporter) {
    const toPrerender = findPrerenderRoots(win, doc.body);
    if (!toPrerender.length) return { success: 0, total: 0 };
    toPrerender.forEach((v, i) => v.dataset.prerenderId = `${i}`);

    const copy = doc.cloneNode(true) as Document;

    inlineCss(copy, {
        removeStyleTags: true,
        removeClasses: true,
        filter: (el) => 'prerenderId' in el.dataset
    });

    progress?.(0, toPrerender.length);
    let i = 0, success = 0;
    for (const elem of toPrerender) {
        const inlined = copy.querySelector(`[data-prerender-id="${i}"]`);
        Debug.assert(!!inlined);
        console.log(inlined.outerHTML);
        i++;

        const rect = findBoundingRect(elem);
        if (!rect) {
            console.log('element has no size:', elem);
            continue;
        }

        const file = await prerenderElement(inlined as HTMLElement, rect.width, rect.height);
        if (!file) {
            console.log('failed to prerender', inlined);
            continue;
        }

        await new Promise<void>((resolve) => {
            const img = doc.createElement('img');
            elem.parentElement!.replaceChild(img, elem);
            img.onload = () => {
                success++;
                resolve();
            };
            img.onerror = () => resolve();
            img.src = convertFileSrc(file);
            img.dataset.originalSrc = 'file:' + file;
            img.dataset.prerendered = '';
            img.style.width = '100%';
        });
        progress?.(i, toPrerender.length);
    };
    return { success, total: toPrerender.length };
}

export async function postprocess(
    html: string
) {
    const frame = Interface.frame;
    Debug.assert(!!frame);

    const restoreScroll = {
        x: frame.contentWindow?.scrollX ?? 0,
        y: frame.contentWindow?.scrollY ?? 0
    };

    frame.srcdoc = html;
    const doc = frame.contentDocument!;
    const win = frame.contentWindow!;

    await new Promise<void>((r) => {
        frame.addEventListener(
            'load', () => {
                r();
            }, { once: true }
        );
    });

    inlineBeforeAfter(win);
    convertNewlines(win);

    let copy = doc.cloneNode(true) as Document;
    let notCached = 0;
    for (const elem of [...copy.body.querySelectorAll('*')]) {
        // remove outlinks
        if (elem.tagName == 'A') {
            // console.log(elem);
            const anchor = elem as HTMLAnchorElement;
            try {
                const url = new URL(anchor.href);
                if (url.host != 'mp.weixin.qq.com')
                    anchor.href = '';
            } catch (_) {
                anchor.href = '';
            }
        }

        // substitute images URLs to uploaded versions
        else if (elem.tagName == 'IMG') {
            const img = elem as HTMLImageElement;

            try {
                const url = new URL(img.dataset.originalSrc ?? img.src);
                const hash = await RustAPI.hashFile(url);
                const cached = await WeixinClient.getSmallImageCacheUrl(hash);
                if (cached) {
                    img.src = cached;
                    img.dataset.originalSrc = undefined;
                } else if (url.protocol == 'file:') {
                    notCached++;
                }
            } catch (_) {
                img.src = '';
            }
        }
    }

    const backgroundImage = Interface.backgroundImage.get();
    if (backgroundImage) {
        const hash = await RustAPI.hashFile(new URL(backgroundImage));
        const cache = await WeixinClient.getSmallImageCacheUrl(hash);
        if (!cache) {
            notCached++;
        } else {
            console.log('bkg img cache', cache);
            const result = await compileStyles({
                sass: Workspace.stylesheet.source,
                colors: Interface.colors.get(),
                backgroundImage: cache
            });
            Debug.assert(typeof result == 'string');
            copy.head.getElementsByTagName('style')[0].textContent = result;
        }
    }

    inlineCss(copy, { removeStyleTags: true, removeClasses: true });

    copy.body.querySelectorAll('*').forEach((elem) => {
        if (CONVERT_TO_SECTION.has(elem.tagName.toLowerCase())) {
            DOMUtil.replaceTagName(elem, 'section', copy);
        }
        else if (CONVERT_TO_SPAN.has(elem.tagName.toLowerCase())) {
            DOMUtil.replaceTagName(elem, 'span', copy);
        }
        else if (!PRESERVE.has(elem.tagName.toLowerCase())) {
            console.warn('unhandled element type:', elem.tagName);
        }
    });

    const ret = { result: copy.body.innerHTML, notCached };

    // restore frame
    await Interface.render({ restoreScroll });

    return ret;
}
