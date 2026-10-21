import { HTML_CLASS, MEDIA_QUERY } from './constants.js';
import type { DarkModeConfig } from './config.js';

export class CssWriter {
    private firstPageStyle = '';
    private otherPageStyle = '';
    private readonly watchers = new Map<string, () => void>();
    private readonly styleElements: HTMLStyleElement[] = [];
    private enabled = true;

    isFinish = false;

    constructor(
        private readonly config: DarkModeConfig,
        private readonly isDarkmode: () => boolean,
        private readonly document: Document
    ) {}

    genCssKV(key: string, value: string): string {
        this.watchers.get(key)?.();
        return `${key}: ${value} !important;`;
    }

    genCss(className: string, cssKV: string): string {
        const modeSelector =
            this.config.mode === 'dark' ? `html.${HTML_CLASS} ` : '';
        const prefix = this.config.cssSelectorsPrefix
            ? `${this.config.cssSelectorsPrefix} `
            : '';
        return `${modeSelector}${prefix}.${className}{${cssKV}}`;
    }

    addCss(css: string, isFirstPageStyle = false): void {
        this[isFirstPageStyle ? 'firstPageStyle' : 'otherPageStyle'] += css;
    }

    get hasStyles(): boolean {
        return this.styleElements.length > 0;
    }

    setEnabled(enabled: boolean): void {
        this.enabled = enabled;
        this.styleElements.forEach((style) => {
            style.media = enabled ? '' : 'not all';
        });
    }

    writeStyle(isFirstPageStyle = false): void {
        if (!isFirstPageStyle && this.isDarkmode()) {
            this.isFinish = true;
        }

        let style = '';
        if (this.isDarkmode()) {
            if (isFirstPageStyle) {
                style = this.firstPageStyle;
                this.firstPageStyle = '';
            } else {
                this.otherPageStyle = this.firstPageStyle + this.otherPageStyle;
                this.firstPageStyle = '';
                style = this.otherPageStyle;
                this.otherPageStyle = '';
            }

            if (style && this.config.mode !== 'dark') {
                style = `@media ${MEDIA_QUERY} {${style}}`;
            }
        }

        if (style) {
            const element = this.document.createElement('style');
            element.setAttribute('type', 'text/css');
            element.textContent = style;
            if (!this.enabled) {
                element.media = 'not all';
            }
            this.document.head.appendChild(element);
            this.styleElements.push(element);
        }
    }

    watch(key: string, callback: () => void): void {
        this.watchers.set(key, callback);
    }

    unwatch(key: string): void {
        this.watchers.delete(key);
    }
}
