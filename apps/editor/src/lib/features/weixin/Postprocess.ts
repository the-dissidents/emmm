import { renderText } from "$lib/features/article";
import { DOMUtil } from "$lib/utils";
import { inlineCss } from "@the_dissidents/dom-css-inliner";
import { Weixin } from "./API";

const CONVERT_TO_SECTION = new Set([
    'address', 'article', 'aside', 'blockquote', 'dd', 'div', 'dl', 'dt', 'fieldset',
    'figcaption', 'figure', 'footer', 'form', 'header',
    'li', 'main', 'nav', 'ol', 'pre', 'ul'
]);

const CONVERT_TO_SPAN = new Set([
    'abbr', 'acronym', 'b', 'bdo', 'big', 'cite', 'code', 'dfn', 'em', 'i',
    'kbd', 'output', 'q', 'samp', 'small', 'strong',  'time', 'tt', 'var'
]);

const PRESERVE = new Set([
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'table', 'thead', 'tbody', 'tfoot', 'th', 'td', 'tr',
    'p', 'span', 'section', 'img', 'a', 'hr', 'br', 'sub', 'sup',
]);

export async function postprocess(doc: Document, win: Window) {
    let befores = new Map<string, string>();
    let afters = new Map<string, string>();
    // prepare ::before/::after data
    doc.querySelectorAll('*').forEach((elem) => {
        const path = DOMUtil.pathOf(elem);
        getPseudo('::before', befores);
        getPseudo('::after', afters);

        function getPseudo(c: string, s: Map<string, string>) {
            let content = win!
                .getComputedStyle(elem, c)
                .getPropertyValue('content');
            if (content && content !== 'none' && content !== "normal") {
                s.set(path, DOMUtil.parseCssString(content));
            }
        }
    });

    let copy = doc.cloneNode(true) as Document;
    let notCached = 0;
    copy.body.querySelectorAll('*').forEach((elem) => {
        // inline all ::before and ::after
        const path = DOMUtil.pathOf(elem);
        let before = befores.get(path);
        let after = afters.get(path);
        if (before) {
            let f = new DocumentFragment();
            f.append(...renderText(before));
            elem.insertBefore(f, elem.firstChild);
        }
        if (after) {
            let f = new DocumentFragment();
            f.append(...renderText(after));
            elem.appendChild(f);
        }

        // remove outlinks
        if (elem.tagName == 'A') {
            // console.log(elem);
            const anchor = elem as HTMLAnchorElement;
            try {
                const url = new URL(anchor.href);
                if (url.host != 'mp.weixin.qq.com')
                    (elem as HTMLAnchorElement).href = '';
            } catch (_) {
                (elem as HTMLAnchorElement).href = '';
            }
        }

        // subtitle images URLs to uploaded versions
        else if (elem.tagName == 'IMG') {
            // console.log(elem);
            const img = elem as HTMLImageElement;
            const url = new URL(img.dataset.originalSrc ?? img.src);

            const realhref = url.href + (url.href.endsWith('png') ? '' : '.png');
            const cached = Weixin.smallImageCache.get(realhref);
            if (cached) {
                img.src = cached;
                img.dataset.originalSrc = undefined;
            } else if (url.protocol == 'file:') {
                notCached++;
            }
        }
    });

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
    return { result: copy.body.innerHTML, notCached };
}
