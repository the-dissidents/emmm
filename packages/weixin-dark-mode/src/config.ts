import {
    DEFAULT_DARK_BGCOLOR,
    DEFAULT_DARK_TEXTCOLOR,
    DEFAULT_LIGHT_BGCOLOR,
    DEFAULT_LIGHT_TEXTCOLOR,
    HTML_CLASS,
} from './constants.js';

export type ColorMode = 'dark' | 'light';

export type DarkModeWindow = Window & {
    HTMLElement: typeof HTMLElement;
    SVGElement: typeof SVGElement;
};

export interface DarkModeWhitelist {
    tagName?: string[];
    attribute?: string[];
}

export interface DarkModeOptions {
    begin?: (isSwitch: boolean) => void;
    showFirstPage?: () => void;
    error?: (error: unknown) => void;
    mode?: ColorMode;
    whitelist?: DarkModeWhitelist;
    needJudgeFirstPage?: boolean;
    delayBgJudge?: boolean;
    normalizeModernColors?: boolean;
    container?: HTMLElement | null;
    cssSelectorsPrefix?: string;
    defaultLightTextColor?: string;
    defaultLightBgColor?: string;
    defaultDarkTextColor?: string;
    defaultDarkBgColor?: string;
}

export class DarkModeConfig {
    hasInit = false;

    begin: ((isSwitch: boolean) => void) | null = null;
    showFirstPage: (() => void) | null = null;
    error: ((error: unknown) => void) | null = null;

    mode: '' | ColorMode = '';
    whitelist: Required<DarkModeWhitelist> = {
        tagName: ['MPCPS', 'IFRAME'],
        attribute: [],
    };

    needJudgeFirstPage = true;
    delayBgJudge = false;
    normalizeModernColors = false;
    container: HTMLElement | null = null;
    cssSelectorsPrefix = '';

    defaultLightTextColor = DEFAULT_LIGHT_TEXTCOLOR;
    defaultLightBgColor = DEFAULT_LIGHT_BGCOLOR;
    defaultDarkTextColor = DEFAULT_DARK_TEXTCOLOR;
    defaultDarkBgColor = DEFAULT_DARK_BGCOLOR;

    applyOptions(
        options: DarkModeOptions,
        document: Document,
        window: DarkModeWindow
    ): void {
        if (options.whitelist) {
            options.whitelist.tagName?.forEach((tagName) => {
                const normalized = tagName.toUpperCase();
                if (!this.whitelist.tagName.includes(normalized)) {
                    this.whitelist.tagName.push(normalized);
                }
            });

            options.whitelist.attribute?.forEach((attribute) => {
                if (!this.whitelist.attribute.includes(attribute)) {
                    this.whitelist.attribute.push(attribute);
                }
            });
        }

        if (options.mode === 'dark' || options.mode === 'light') {
            this.mode = options.mode;
            if (options.mode === 'dark') {
                document
                    .getElementsByTagName('html')[0]
                    .classList.add(HTML_CLASS);
            }
        }

        if (typeof options.begin === 'function') this.begin = options.begin;
        if (typeof options.showFirstPage === 'function') {
            this.showFirstPage = options.showFirstPage;
        }
        if (typeof options.error === 'function') this.error = options.error;

        if (typeof options.needJudgeFirstPage === 'boolean') {
            this.needJudgeFirstPage = options.needJudgeFirstPage;
        }
        if (typeof options.delayBgJudge === 'boolean') {
            this.delayBgJudge = options.delayBgJudge;
        }
        if (typeof options.normalizeModernColors === 'boolean') {
            this.normalizeModernColors = options.normalizeModernColors;
        }
        if (
            options.container &&
            options.container instanceof window.HTMLElement
        ) {
            this.container = options.container;
        }

        this.setNonEmptyString(options, 'cssSelectorsPrefix');
        this.setNonEmptyString(options, 'defaultLightTextColor');
        this.setNonEmptyString(options, 'defaultLightBgColor');
        this.setNonEmptyString(options, 'defaultDarkTextColor');
        this.setNonEmptyString(options, 'defaultDarkBgColor');
    }

    private setNonEmptyString(
        options: DarkModeOptions,
        key:
            | 'cssSelectorsPrefix'
            | 'defaultLightTextColor'
            | 'defaultLightBgColor'
            | 'defaultDarkTextColor'
            | 'defaultDarkBgColor'
    ): void {
        const value = options[key];
        if (typeof value === 'string' && value !== '') {
            this[key] = value;
        }
    }
}
