import { BackgroundNodeStack } from './background-stack.js';
import {
    DarkModeConfig,
    type DarkModeOptions,
    type DarkModeWindow,
} from './config.js';
import { CLASS_PREFIX, MEDIA_QUERY } from './constants.js';
import { Converter } from './converter.js';
import { CssWriter } from './css-writer.js';
import { DomUtils, type ElementCollection } from './dom-utils.js';
import { TextNodeQueue } from './text-node-queue.js';

const DARK_MODE_CLASS_REGEXP = new RegExp(`${CLASS_PREFIX}[^ ]+`, 'g');

export type StyleOverrides = Record<string, string>;

interface SwitchOptions {
    force?: boolean;
    type: 'dom' | 'bg';
}

export class DarkMode {
    private readonly config: DarkModeConfig;

    private readonly window: DarkModeWindow;
    private readonly document: Document;
    private readonly css: CssWriter;
    private readonly converter: Converter;
    private readonly domUtils: DomUtils;
    private readonly backgroundStack: BackgroundNodeStack;
    private readonly textQueue: TextNodeQueue;
    private readonly pageHeight: number;

    private mql: MediaQueryList | null = null;

    constructor(window: Window) {
        this.window = window as DarkModeWindow;
        this.document = window.document;
        this.config = new DarkModeConfig();

        const windowWithLegacyHeight = this.window as Window & {
            getInnerHeight?: () => number;
        };

        this.pageHeight =
            windowWithLegacyHeight.getInnerHeight?.() ||
            window.innerHeight ||
            this.document.documentElement.clientHeight;

        this.backgroundStack = new BackgroundNodeStack(
            `${CLASS_PREFIX}bg__`,
            this.config
        );
        this.textQueue = new TextNodeQueue(
            `${CLASS_PREFIX}text__`,
            this.config
        );
        this.css = new CssWriter(
            this.config,
            () => this.converter.isDarkmode,
            this.document
        );
        this.converter = new Converter({
            window: this.window,
            config: this.config,
            css: this.css,
            backgroundStack: this.backgroundStack,
            textQueue: this.textQueue,
        });
        this.domUtils = new DomUtils(
            this.config,
            () => this.converter.isDarkmode
        );
    }

    run(nodes: ElementCollection, options?: DarkModeOptions): void {
        this.init(options);
        this.domUtils.set(nodes);
        this.switchToDarkMode(this.mql, {
            force: true,
            type: 'dom',
        });
    }

    init(options: DarkModeOptions = {}): void {
        if (this.config.hasInit) return;

        this.config.hasInit = true;
        this.config.applyOptions(options, this.document, this.window);
        this.converter.init();

        if (
            !this.config.mode &&
            this.mql === null &&
            typeof this.window.matchMedia === 'function'
        ) {
            this.mql = this.window.matchMedia(MEDIA_QUERY);
            this.mql.addListener(this.handleMediaChange);
        }
    }

    convertBg(nodes: ElementCollection): void {
        this.domUtils.set(nodes);

        if (this.config.container !== null) {
            this.backgroundStack.update(nodes);
            this.textQueue.update(nodes);
        }

        this.switchToDarkMode(this.mql, {
            force: true,
            type: 'bg',
        });

        if (this.config.delayBgJudge && this.textQueue.length === 0) {
            this.backgroundStack.clear();
        }
    }

    updateStyle(node: HTMLElement, styles?: StyleOverrides): void {
        if (!this.css.isFinish) return;

        this.css.addCss(
            this.converter.convert(
                node,
                styles
                    ? Object.keys(styles).map(
                          (key) => [key, styles[key]] as [string, string]
                      )
                    : undefined,
                true
            ),
            false
        );
        this.css.writeStyle();
    }

    getContrast(color1: string, color2: string): number {
        return this.converter.getContrast(color1, color2);
    }

    private readonly handleMediaChange = (event: MediaQueryListEvent): void => {
        this.switchToDarkMode(event, { type: 'dom' });
    };

    private switchToDarkMode(
        mql: MediaQueryList | MediaQueryListEvent | null,
        options: SwitchOptions = { type: 'dom' }
    ): void {
        const { config, converter, css, domUtils } = this;

        if (options.force) {
            css.isFinish = false;
        }
        if (css.isFinish) return;

        try {
            converter.isDarkmode = config.mode
                ? config.mode === 'dark'
                : mql!.matches;

            if (options.type === 'dom') {
                if (converter.isDarkmode) {
                    config.begin?.(domUtils.hasDelay());
                }

                for (const node of domUtils.get()) {
                    if (!converter.isDarkmode) continue;

                    const el = node as HTMLElement;

                    if (el.className && typeof el.className === 'string') {
                        el.className = el.className.replace(
                            DARK_MODE_CLASS_REGEXP,
                            ''
                        );
                    }

                    if (config.needJudgeFirstPage) {
                        const rect = el.getBoundingClientRect();
                        const top = rect.top;
                        const bottom = rect.bottom;

                        if (top <= 0 && bottom <= 0) {
                            css.addCss(converter.convert(el));
                        } else if (
                            (top > 0 && top < this.pageHeight) ||
                            (bottom > 0 && bottom < this.pageHeight)
                        ) {
                            domUtils.addFirstPageNode(el);
                            css.addCss(converter.convert(el), true);
                        } else {
                            config.needJudgeFirstPage = false;
                            css.writeStyle(true);
                            domUtils.showFirstPageNodes();
                            config.showFirstPage?.();
                            css.addCss(converter.convert(el));
                        }
                    } else {
                        css.addCss(converter.convert(el));
                    }
                }
            } else if (options.type === 'bg' && converter.isDarkmode) {
                this.textQueue.forEach((text) => {
                    this.backgroundStack.contains(text, (background) => {
                        css.addCss(
                            css.genCss(background.className, background.cssKV)
                        );
                        background.cb?.(background);

                        const children = converter.resetInheritedState(
                            background.el as HTMLElement
                        );

                        children.forEach((child) => {
                            css.addCss(
                                converter.convert(
                                    child as HTMLElement,
                                    undefined,
                                    false,
                                    true
                                )
                            );
                        });
                    });
                });
            }

            if (
                config.needJudgeFirstPage ||
                (!config.needJudgeFirstPage && !domUtils.showFirstPage)
            ) {
                config.showFirstPage?.();
            }

            css.writeStyle();
            domUtils.emptyFirstPageNodes();

            if (!converter.isDarkmode) {
                config.needJudgeFirstPage = false;
                config.delayBgJudge = false;

                if (
                    config.container === null &&
                    options.type === 'dom' &&
                    domUtils.length
                ) {
                    domUtils.delay();
                }
            }
        } catch (error) {
            console.log(
                'An error occurred when running the dark mode conversion algorithm\n',
                error
            );
            config.error?.(error);
        }
    }
}

export function createDarkMode(window: Window): DarkMode {
    return new DarkMode(window);
}
