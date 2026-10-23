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
