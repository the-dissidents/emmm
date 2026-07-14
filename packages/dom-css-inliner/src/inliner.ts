import { calculateSpecificity, compareSpecificity, Specificity } from "./specificity.js";

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

export type InlineCssOptions = {
    removeStyleTags?: boolean,
    removeClasses?: boolean,
    simulateInheritance?: boolean | string[],
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
        const matchingRules: Rule[] = 
            allRules.filter(x => element.matches(x.rule.selectorText));

        matchingRules.sort((a, b) => {
            const specCompare = compareSpecificity(a.specificity, b.specificity);
            return specCompare !== 0 ? specCompare : a.sourceOrder - b.sourceOrder;
        });

        const finalStyles = new Map<string, { value: string; priority: string }>();
        matchingRules.forEach(({ rule }) => {
            Array.from(rule.style).forEach(propName => {
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

    if (options.simulateInheritance) {
        const inheritedProps = Array.isArray(options.simulateInheritance)
            ? options.simulateInheritance
            : DEFAULT_INHERITED_PROPERTIES;

        for (const el of allElements) {
            if (el === doc.body) continue;
            const parent = el.parentElement!;
            const parentComputed = getComputedStyle(parent);
            for (const prop of inheritedProps) {
                if (el.style.getPropertyValue(prop) === '') {
                    if (parent.style.getPropertyValue(prop) !== '') {
                        el.style.setProperty(prop, parentComputed.getPropertyValue(prop), '');
                    }
                }
            }
        }
    }

    if (options.removeStyleTags)
        doc.querySelectorAll('style').forEach(
            style => style.parentNode?.removeChild(style));
    
    if (options.removeClasses)
        doc.body.querySelectorAll('*').forEach(
            elem => elem.removeAttribute('class'));
}