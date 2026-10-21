import { HTML_CLASS, MEDIA_QUERY } from './constants.js';
import type { DarkModeConfig } from './config.js';

export class CssWriter {
    private firstPageStyle = '';
    private otherPageStyle = '';
    private readonly watchers = new Map<string, () => void>();

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
            this.document.head.insertAdjacentHTML(
                'beforeend',
                `<style type="text/css">${style}</style>`
            );
        }
    }

    watch(key: string, callback: () => void): void {
        this.watchers.set(key, callback);
    }

    unwatch(key: string): void {
        this.watchers.delete(key);
    }
}
