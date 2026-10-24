import { calculateSpecificity, compareSpecificity, Specificity } from "./specificity.js";
import { DOMUtil } from "./util.js";

const DEFAULT_INHERITED_PROPERTIES = [
    'border-collapse', 'border-spacing', 'caption-side', 'color', 'cursor',
    'direction', 'empty-cells', 'font-family', 'font-size', 'font-style',
    'font-variant', 'font-weight', 'font-size-adjust', 'font-stretch', 'font',
    'letter-spacing', 'line-height', 'list-style-image', 'list-style-position',
    'list-style-type', 'list-style', 'orphans', 'quotes', 'tab-size',
    'text-align', 'text-align-last', 'text-decoration-color', 'text-indent',
    'text-justify', 'text-shadow', 'text-transform', 'visibility', 'white-space',
    'widows', 'word-break', 'word-spacing', 'word-wrap',
];

const PRESERVED_WHITE_SPACE = new Set([
    "pre",
    "pre-wrap",
    "pre-line",
    "break-spaces",
]);

const PRESERVED_WHITE_SPACE_COLLAPSE = new Set([
    "preserve",
    "preserve-breaks",
]);

const NON_CONTENT_TAGS = "script, style, title, br";

export type InlineCssOptions = {
    removeStyleTags?: boolean,
    removeClasses?: boolean,
    filter?: (el: HTMLElement) => boolean,
};

export function inlineBeforeAfter(win: Window) {
    const doc = win.document;
    const befores = new Map<string, string>();
    const afters = new Map<string, string>();

    // prepare ::before/::after data
    doc.querySelectorAll('*').forEach((elem) => {
        const path = DOMUtil.pathOf(elem);
        getPseudo('::before', befores);
        getPseudo('::after', afters);

        function getPseudo(c: string, s: Map<string, string>) {
            let content = win
                .getComputedStyle(elem, c)
                .getPropertyValue('content');
            if (content && content !== 'none' && content !== "normal") {
                s.set(path, DOMUtil.parseCssString(content));
            }
        }
    });

    for (const elem of [...doc.body.querySelectorAll('*')]) {
        // inline all ::before and ::after
        const path = DOMUtil.pathOf(elem);
        const before = befores.get(path);
        const after = afters.get(path);
        if (before) elem.insertBefore(doc.createTextNode(before), elem.firstChild);
        if (after) elem.appendChild(doc.createTextNode(after));
    }
}

export function convertNewlines(win: Window, root?: Node) {
    const doc = win.document;
    root ??= doc.body;

    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const toProcess: Text[] = [];

    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = node as Text;
        const parent = text.parentElement;
        if (!parent
         || !/[\r\n]/.test(text.data)
         || text.data.trim() === ""
         || parent.closest(NON_CONTENT_TAGS)) continue;

        const style = win.getComputedStyle(parent);
        const whiteSpaceCollapse = style
            .getPropertyValue("white-space-collapse").trim();

        const preservesBreaks =
               PRESERVED_WHITE_SPACE.has(style.whiteSpace)
            || PRESERVED_WHITE_SPACE_COLLAPSE.has(whiteSpaceCollapse);

        if (preservesBreaks)
            toProcess.push(text);
    }

    console.log(toProcess);

    for (const text of toProcess) {
        const content: (Node | string)[] = [];
        const parts = text.data.split(/\r\n?|\n/);

        parts.forEach((part, index) => {
            if (index > 0)
                content.push(doc.createElement("br"));
            if (part)
                content.push(part);
        });

        text.replaceWith(...content);
        console.log(content);
    }
}

export function inlineCss(doc: Document, options: InlineCssOptions = {}) {
    type Rule = {
        rule: CSSStyleRule;
        specificity: Specificity;
        sourceOrder: number;
    };

    const allRules: Rule[] = [];
    doc.querySelectorAll('style').forEach(style => {
        Array.from(style.sheet?.cssRules ?? []).forEach(rule => {
            if (rule.constructor.name == 'CSSStyleRule') {
                const styleRule = rule as CSSStyleRule;
                allRules.push({
                    rule: styleRule,
                    specificity: calculateSpecificity(styleRule.selectorText),
                    sourceOrder: allRules.length,
                });
            }
        });
    });

    const allElements = [doc.body, ...Array.from(doc.body.querySelectorAll<HTMLElement>('*'))];
    allElements.forEach(element => {
        if (element.matches(NON_CONTENT_TAGS)) return;

        const matchingRules: Rule[] =
            allRules.filter(x => element.matches(x.rule.selectorText));

        matchingRules.sort((a, b) => {
            const specCompare = compareSpecificity(a.specificity, b.specificity);
            return specCompare !== 0 ? specCompare : a.sourceOrder - b.sourceOrder;
        });

        const finalStyles = new Map<string, { value: string; priority: string }>();
        matchingRules.forEach(({ rule }) => {
            [...rule.style].forEach(propName => {
                const value = rule.style.getPropertyValue(propName);
                const priority = rule.style.getPropertyPriority(propName);

                const existing = finalStyles.get(propName);
                if (!existing || priority === 'important' || existing.priority !== 'important') {
                    finalStyles.set(propName, { value, priority });
                }
            });
        });

        finalStyles.forEach(({ value, priority }, prop) => {
            element.style.setProperty(prop, value, priority);
        });
    });

    const filtered = options.filter ?  allElements.filter(options.filter) : allElements;
    if (options.filter) {
        function simulateInheritance(el: HTMLElement) {
            if (el !== doc.body && filtered.find((x) => x.contains(el))) {
                const computed = getComputedStyle(el);
                if (computed.display !== 'contents' && computed.display !== 'none')
                    for (const prop of DEFAULT_INHERITED_PROPERTIES) {
                        if (el.style.getPropertyValue(prop) === ''
                         && el.parentElement?.style.getPropertyValue(prop) === '')
                        {
                            el.style.setProperty(prop, computed.getPropertyValue(prop), '');
                        }
                    }
            }

            for (const child of el.children) {
                const ch = child as HTMLElement;
                simulateInheritance(ch);
            }
        }
        simulateInheritance(doc.body);
    }

    if (options.removeStyleTags)
        doc.querySelectorAll('style').forEach(
            style => style.parentNode?.removeChild(style));

    if (options.removeClasses)
        doc.body.querySelectorAll('*').forEach(
            elem => elem.removeAttribute('class'));

    return filtered;
}
