function normalizeCaptionSpacing(footer: HTMLElement) {
    for (const anchor of footer.querySelectorAll('a[linktype="image"]')) {
        const captions = anchor.parentElement?.nextElementSibling?.querySelectorAll('p');
        captions?.forEach(caption => {
            // A body p rule adds margin-block even when the template has margin: 0.
            // Reset both logical and physical spacing before preview and after CSS inlining.
            for (const property of ['margin', 'margin-block', 'margin-inline', 'padding', 'padding-block', 'padding-inline'])
                caption.style.setProperty(property, '0');
        });
    }
}

/** Preserve card caption spacing and explicit colors through the original CSS inliner. */
export function styleHistory(footer: HTMLElement, headingColor?: string, textColor?: string): HTMLElement {
    normalizeCaptionSpacing(footer);
    const valid = (color?: string) => !!color && /^#[\da-f]{6}$/i.test(color);
    if (valid(textColor)) {
        footer.dataset.weixinHistoryTextColor = textColor;
        footer.style.color = textColor!;
        // Image captions remain white on their dark overlay.
        footer.querySelectorAll<HTMLElement>('[style]').forEach(node => {
            if (node.style.color && !['rgb(255, 255, 255)', '#ffffff', 'white'].includes(node.style.color))
                node.style.color = textColor!;
        });
    }
    const heading = footer.querySelector<HTMLElement>('strong');
    if (heading && valid(headingColor)) {
        footer.dataset.weixinHistoryHeadingColor = headingColor;
        heading.style.color = headingColor!;
    }
    return footer;
}

export function finalizeWeixinFooterColors(doc: Document) {
    for (const footer of doc.querySelectorAll<HTMLElement>('[data-weixin-history]')) {
        const headingColor = footer.dataset.weixinHistoryHeadingColor;
        styleHistory(footer, undefined, footer.dataset.weixinHistoryTextColor);
        const heading = footer.querySelector<HTMLElement>('strong');
        if (heading && headingColor) heading.style.color = headingColor;
        delete footer.dataset.weixinHistoryHeadingColor;
        delete footer.dataset.weixinHistoryTextColor;
    }
}

export function syncWeixinFooterHeadingColors(doc: Document, win: Window, mirror?: Document | null) {
    const title = doc.querySelector<HTMLElement>('header .title')
        ?? doc.querySelector<HTMLElement>('header h1') ?? doc.querySelector<HTMLElement>('h1');
    if (!title) return;
    const color = win.getComputedStyle(title).color;
    for (const target of mirror ? [doc, mirror] : [doc]) {
        for (const footer of target.querySelectorAll<HTMLElement>('[data-weixin-history]')) {
            const heading = footer.querySelector<HTMLElement>('strong');
            if (heading) {
                heading.style.color = color;
                footer.dataset.weixinHistoryHeadingColor = color;
            }
        }
    }
}
