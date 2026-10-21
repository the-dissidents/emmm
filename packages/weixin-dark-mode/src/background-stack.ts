import type { DarkModeConfig } from './config.js';

export interface BackgroundNode {
    el: Element;
    className: string;
    cssKV: string;
    updated: boolean;
    rect?: DOMRect;
    cb?: (item: BackgroundNode) => void;
}

export class BackgroundNodeStack {
    readonly classNameReg: RegExp;

    private stack: BackgroundNode[] = [];
    private index = 0;

    constructor(
        private readonly prefix: string,
        private readonly config: DarkModeConfig
    ) {
        this.classNameReg = new RegExp(`${prefix}\\d+`);
    }

    push(
        el: Element,
        cssKV: string,
        callback?: (item: BackgroundNode) => void
    ): void {
        const className = `${this.prefix}${this.index++}`;
        el.classList.add(className);
        this.stack.unshift({
            el,
            className,
            cssKV,
            updated: !this.config.delayBgJudge,
            cb: callback,
        });
    }

    contains(el: Element, callback: (item: BackgroundNode) => void): void {
        const rect = el.getBoundingClientRect();
        const matchingIndices: number[] = [];

        this.stack.forEach((item, index) => {
            if (!item.updated) return;

            item.rect ??= item.el.getBoundingClientRect();
            const backgroundRect = item.rect;

            const isOutside =
                rect.top >= backgroundRect.bottom ||
                rect.bottom <= backgroundRect.top ||
                rect.left >= backgroundRect.right ||
                rect.right <= backgroundRect.left;

            if (!isOutside) {
                matchingIndices.unshift(index);
            }
        });

        while (matchingIndices.length) {
            const index = matchingIndices.shift()!;
            const item = this.config.delayBgJudge
                ? this.stack[index]
                : this.stack.splice(index, 1)[0];

            callback(item);
        }
    }

    update(els: Iterable<Element> | ArrayLike<Element>): void {
        const elements = Array.from(els);

        this.stack.forEach((item) => {
            if (item.updated) return;

            elements.some((el) => {
                if (
                    el.nodeType === 1 &&
                    el.classList.contains(item.className)
                ) {
                    item.el = el;
                    item.updated = true;
                    return true;
                }
                return false;
            });
        });
    }

    clear(): void {
        this.stack = [];
    }
}
