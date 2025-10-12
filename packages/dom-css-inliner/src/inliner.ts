import { calculateSpecificity, compareSpecificity, Specificity } from "./specificity.js";

export type InlineCssOptions = {
    removeStyleTags?: boolean,
    removeClasses?: boolean,
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

    doc.body.querySelectorAll<HTMLElement>('*').forEach(element => {
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

    if (options.removeStyleTags)
        doc.querySelectorAll('style').forEach(
            style => style.parentNode?.removeChild(style));
    
    if (options.removeClasses)
        doc.body.querySelectorAll('*').forEach(
            elem => elem.removeAttribute('class'));
}