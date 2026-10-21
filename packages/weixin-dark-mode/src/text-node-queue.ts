import type { DarkModeConfig } from './config.js';

interface TextNode {
    el: Element;
    className: string;
    updated: boolean;
}

export class TextNodeQueue {
    private queue: TextNode[] = [];
    private index = 0;

    constructor(
        private readonly prefix: string,
        private readonly config: DarkModeConfig
    ) {}

    get length(): number {
        return this.queue.length;
    }

    push(el: Element): void {
        const className = `${this.prefix}${this.index++}`;
        el.classList.add(className);
        this.queue.push({
            el,
            className,
            updated: !this.config.delayBgJudge,
        });
    }

    forEach(callback: (el: Element) => void): void {
        const matchingIndices: number[] = [];

        this.queue.forEach((item, index) => {
            if (!item.updated) return;

            matchingIndices.unshift(index);
            callback(item.el);
        });

        while (matchingIndices.length) {
            this.queue.splice(matchingIndices.shift()!, 1);
        }
    }

    update(els: Iterable<Element> | ArrayLike<Element>): void {
        const elements = Array.from(els);

        this.queue.forEach((item) => {
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
}
