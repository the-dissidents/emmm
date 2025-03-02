export function postprocessWeChat(frame: HTMLIFrameElement): string {
    if (!frame.contentDocument || !frame.contentWindow) throw new Error('iframe not loaded');
    let befores = new Map<string, string>();
    let afters = new Map<string, string>();
    // inline all ::before and ::after
    frame.contentDocument.querySelectorAll('*').forEach((elem) => {
        const path = cssPath(elem);
        getPseudo('::before', befores);
        getPseudo('::after', afters);

        function getPseudo(c: string, s: Map<string, string>) {
            let content = frame.contentWindow!
                .getComputedStyle(elem, c)
                .getPropertyValue('content');
            if (content && content !== 'none' && content !== "normal") {
                content = content.replace(/^["'](.*)["']$/, "$1");
                s.set(path, content);
            }
        }
    });
    let copy = frame.contentDocument.cloneNode(true) as Document;
    copy.querySelectorAll('*').forEach((elem) => {
        const path = cssPath(elem);
        let before = befores.get(path);
        let after = afters.get(path);
        if (before) elem.insertBefore(copy.createTextNode(before), elem.firstChild);
        if (after) elem.appendChild(copy.createTextNode(after));

        if (elem.tagName == 'A') {
            elem.setAttribute('href', '');
            // TODO: detect mp.weixin.qq.com?
        }
    });
    return copy.documentElement.outerHTML;
}

function cssPath(el: Element) {
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
            selector += ":nth-child("+nth+")";
        }
        path.unshift(selector);
        if (!el.parentElement) break;
        el = el.parentElement;
    }
    return path.join(' > ');
}