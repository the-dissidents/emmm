import type { DarkModeConfig } from './config.js';

export type ElementCollection = Iterable<Element> | ArrayLike<Element>;

const TABLE_CLASS_COLORS: Record<string, string> = {
    'ue-table-interlace-color-single': '#fcfcfc',
    'ue-table-interlace-color-double': '#f7faff',
};

export function getChildrenAndIt(el: Element, exceptIt = false): Element[] {
    const descendants = Array.from(el.querySelectorAll('*'));
    return exceptIt ? descendants : [el, ...descendants];
}

export function hasTextNode(el: Element): boolean {
    return (el.textContent ?? '').replace(/\s/g, '').length > 0;
}

export function hasTableClass(el: Element): string | null {
    let color: string | null = null;

    for (const className of Array.from(el.classList)) {
        if (TABLE_CLASS_COLORS[className]) {
            color = TABLE_CLASS_COLORS[className];
            break;
        }
    }

    return color;
}

export class DomUtils {
    private els: Element[] = [];
    private firstPageEls: HTMLElement[] = [];
    private delayEls: Element[] = [];

    showFirstPage = false;

    constructor(
        private readonly config: DarkModeConfig,
        private readonly isDarkmode: () => boolean
    ) {}

    get length(): number {
        return this.els.length;
    }

    set(els: ElementCollection = []): void {
        this.els = Array.from(els);
    }

    get(): Element[] {
        let result: Element[] = [];

        if (this.els.length) {
            result = this.els;
            if (this.isDarkmode()) {
                this.els = [];
            }
        } else if (this.delayEls.length) {
            result = this.delayEls;
            this.delayEls = [];
        } else if (this.config.container) {
            result = Array.from(this.config.container.querySelectorAll('*'));
        }

        return result;
    }

    delay(): void {
        this.delayEls.push(...this.els);
        this.els = [];
    }

    hasDelay(): boolean {
        if (this.els.length) return false;
        return this.delayEls.length > 0 || this.config.container !== null;
    }

    addFirstPageNode(el: HTMLElement): void {
        this.firstPageEls.push(el);
    }

    showFirstPageNodes(): void {
        this.firstPageEls.forEach((el) => {
            if (!el.style.visibility) {
                el.style.visibility = 'visible';
            }
        });
        this.showFirstPage = true;
    }

    emptyFirstPageNodes(): void {
        this.firstPageEls = [];
    }
}
