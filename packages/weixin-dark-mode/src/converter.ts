import Color from 'color';

import {
    adjustBrightnessTo,
    ColorParser,
    getColorPerceivedBrightness,
    mixColors,
    normalizeColorSyntax,
    parseColorName,
    parseWebkitFillColorAndStrokeColor,
} from './color.js';
import type { DarkModeConfig, DarkModeWindow } from './config.js';
import {
    BG_COLOR_DELIMITER,
    CLASS_PREFIX,
    COLOR_REGEXP,
    COLOR_REGEXP_GLOBAL,
    CSS_PROP_LIST,
    CSS_PROP_SERIES,
    DM_CLASSNAME_REGEXP,
    HIGH_BGCOLOR_BRIGHTNESS,
    HIGH_BLACKWHITE_HSL_BRIGHTNESS,
    IGNORE_ALPHA,
    IMPORTANT_REGEXP,
    LOW_BLACKWHITE_HSL_BRIGHTNESS,
    MAX_LIMIT_BGCOLOR_BRIGHTNESS,
    MIN_LIMIT_OFFSET_BRIGHTNESS,
    SEMICOLON_PLACEHOLDER,
    SEMICOLON_PLACEHOLDER_REGEXP,
    TABLE_NAME,
    WHITE_LIKE_COLOR_BRIGHTNESS,
} from './constants.js';
import type {
    BackgroundNode,
    BackgroundNodeStack,
} from './background-stack.js';
import type { CssWriter } from './css-writer.js';
import { getChildrenAndIt, hasTableClass, hasTextNode } from './dom-utils.js';
import type { TextNodeQueue } from './text-node-queue.js';

type StyleEntry = [string, string];

interface ElementState {
    color?: string | Color;
    bgColor?: string | Color;
    originalColor?: string | Color;
    originalBgColor?: string;
    bgImage?: boolean;
    complementaryBgImageColor?: string;
}

interface AdjustBrightnessOptions {
    isBgColor?: boolean;
    isTextColor?: boolean;
    isBorderColor?: boolean;
    isTextShadow?: boolean;
    hasInlineColor?: boolean;
    parentElementBgColorStr?: string | Color | null;
}

interface AdjustBrightnessResult {
    newColor: Color | string | false | undefined;
    extStyle: string;
}

export interface ConverterContext {
    window: DarkModeWindow;
    config: DarkModeConfig;
    css: CssWriter;
    backgroundStack: BackgroundNodeStack;
    textQueue: TextNodeQueue;
}

export class Converter {
    isDarkmode = false;

    private index = 0;
    private state = new WeakMap<Element, ElementState>();

    private defaultDarkTextColorRgb: number[] = [];
    private defaultDarkBgColorRgb: number[] = [];
    private defaultDarkBgColorHsl: number[] = [];
    private defaultDarkTextColorBrightness = 0;
    private defaultDarkBgColorBrightness = 0;
    private defaultDarkBgColorHslBrightness = 0;
    private maxLimitOffsetBrightness = 0;

    constructor(private readonly context: ConverterContext) {}

    init(): void {
        const { config } = this.context;
        const darkTextColor = ColorParser(config.defaultDarkTextColor)!;
        const darkBgColor = ColorParser(config.defaultDarkBgColor)!;

        this.defaultDarkTextColorRgb = darkTextColor.rgb().array();
        this.defaultDarkBgColorRgb = darkBgColor.rgb().array();
        this.defaultDarkBgColorHsl = darkBgColor.hsl().array();
        this.defaultDarkTextColorBrightness = getColorPerceivedBrightness(
            this.defaultDarkTextColorRgb
        );
        this.defaultDarkBgColorBrightness = getColorPerceivedBrightness(
            this.defaultDarkBgColorRgb
        );
        this.defaultDarkBgColorHslBrightness = this.defaultDarkBgColorHsl[2];
        this.maxLimitOffsetBrightness =
            this.defaultDarkTextColorBrightness -
            this.defaultDarkBgColorBrightness;
    }

    getContrast(color1: string, color2: string): number {
        const parsedColor1 = ColorParser(color1);
        const parsedColor2 = ColorParser(color2);

        return parsedColor1 && parsedColor2
            ? parsedColor1.contrast(parsedColor2)
            : 0;
    }

    resetInheritedState(source: HTMLElement): HTMLElement[] {
        const sourceState = this.state.get(source);
        const children = getChildrenAndIt(source, true) as HTMLElement[];

        for (const child of children) {
            const childState = this.getState(child);
            this.copyStateValue(childState, 'color', sourceState?.color);
            this.copyStateValue(childState, 'bgColor', sourceState?.bgColor);
            this.copyStateValue(
                childState,
                'originalColor',
                sourceState?.originalColor
            );
            this.copyStateValue(
                childState,
                'originalBgColor',
                sourceState?.originalBgColor
            );
            this.copyStateValue(childState, 'bgImage', sourceState?.bgImage);
            this.copyStateValue(
                childState,
                'complementaryBgImageColor',
                sourceState?.complementaryBgImageColor
            );
        }

        return children;
    }

    convert(
        el: HTMLElement,
        providedProperties?: StyleEntry[],
        isUpdate = false,
        needReset = false
    ): string {
        let css = '';
        let backgroundCss = '';

        if (!this.isDarkmode && !isUpdate && !needReset) {
            return css;
        }

        const nodeName = el.nodeName;
        const {
            config,
            css: cssWriter,
            backgroundStack,
            textQueue,
        } = this.context;

        if (config.whitelist.tagName.includes(nodeName)) return '';
        if (
            config.whitelist.attribute.some((attribute) =>
                el.hasAttribute(attribute)
            )
        ) {
            return '';
        }

        const styles = el.style;
        let properties = providedProperties ?? this.parseInlineStyles(styles);

        let hasInlineColor = false;
        let hasInlineBackground = false;
        let hasInlineBackgroundImage = false;
        let backgroundPosition: string | null = null;
        let backgroundSize: string | null = null;

        properties = properties
            .filter(([key, value]) => {
                if (key === 'color') {
                    hasInlineColor = true;
                } else if (/background/i.test(key)) {
                    hasInlineBackground = true;
                    if (key === 'background-position') {
                        backgroundPosition = value;
                    } else if (key === 'background-size') {
                        backgroundSize = value;
                    }
                }

                if (
                    (/background/i.test(key) ||
                        /^(-webkit-)?border-image/.test(key)) &&
                    /url\([^)]*\)/i.test(value)
                ) {
                    hasInlineBackgroundImage = true;
                }

                return CSS_PROP_LIST.includes(key);
            })
            .sort(([key1], [key2]) => {
                if (key1 === 'color') {
                    return 1;
                } else if (
                    key1 === 'background-image' &&
                    key2 === 'background-color'
                ) {
                    return 1;
                } else if (key2.indexOf('-webkit-text') === 0) {
                    return 1;
                }
                return -1;
            });

        if (TABLE_NAME.includes(nodeName) && !hasInlineBackground) {
            this.tryRun(() => {
                let colorString = hasTableClass(el);
                if (!colorString) colorString = el.getAttribute('bgcolor');

                if (colorString) {
                    const color = ColorParser(colorString);
                    if (color) {
                        properties.unshift([
                            'background-color',
                            color.toString(),
                        ]);
                        hasInlineBackground = true;
                    }
                }
            });
        }

        if (nodeName === 'FONT' && !hasInlineColor) {
            this.tryRun(() => {
                const colorString = el.getAttribute('color');
                if (colorString) {
                    const color = ColorParser(colorString);
                    if (color) {
                        properties.push(['color', color.toString()]);
                        hasInlineColor = true;
                    }
                }
            });
        }

        let webkitFillColor = '';
        let webkitStrokeColor = '';
        let webkitTextLength = 0;

        properties.some(([key, value], index) =>
            this.tryRun(() => {
                if (key.indexOf('-webkit-text') !== 0) {
                    webkitTextLength = index;
                    return true;
                }

                switch (key) {
                    case '-webkit-text-fill-color':
                        webkitFillColor =
                            parseWebkitFillColorAndStrokeColor(value);
                        break;
                    case '-webkit-text-stroke': {
                        const newValue = value.split(' ');
                        if (newValue.length === 2) {
                            webkitStrokeColor =
                                parseWebkitFillColorAndStrokeColor(newValue[1]);
                        }
                        break;
                    }
                    case '-webkit-text-stroke-color':
                        webkitStrokeColor =
                            parseWebkitFillColorAndStrokeColor(value);
                        break;
                }

                return false;
            })
        );

        if (webkitFillColor) {
            if (hasInlineColor) {
                properties[properties.length - 1] = [
                    '-webkit-text-fill-color',
                    webkitFillColor,
                ];
            } else {
                properties.push(['-webkit-text-fill-color', webkitFillColor]);
                hasInlineColor = true;
            }
        }

        if (webkitTextLength) {
            properties.splice(0, webkitTextLength);
            if (webkitStrokeColor) {
                properties.unshift([
                    '-webkit-text-stroke-color',
                    webkitStrokeColor,
                ]);
            }
        }

        let darkModeClassName = '';
        let darkModeBackgroundClassName = '';

        if (
            (isUpdate || needReset) &&
            el.className &&
            typeof el.className === 'string'
        ) {
            darkModeClassName =
                el.className.match(DM_CLASSNAME_REGEXP)?.[0] ?? '';

            darkModeBackgroundClassName =
                el.className.match(backgroundStack.classNameReg)?.[0] ?? '';
        }

        let cssKeyValues = '';
        let noColor = needReset;

        if (noColor) {
            cssWriter.watch('color', () => {
                noColor = false;
                cssWriter.unwatch('color');
            });
        }

        properties.forEach(([key, originalValue]) =>
            this.tryRun(() => {
                let value = originalValue;
                let cssChanged = false;

                const isBackgroundColor =
                    CSS_PROP_SERIES.BG_COLOR.includes(key);
                const isTextShadow = CSS_PROP_SERIES.TEXT_SHADOW.includes(key);
                const textColorIndex = CSS_PROP_SERIES.TEXT_COLOR.indexOf(key);
                const isBorderColor =
                    CSS_PROP_SERIES.BORDER_COLOR.includes(key);
                const isGradient = /gradient/.test(value);
                const gradientColors: string[] = [];
                let extraStyle = '';
                let gradientMixColor: Color | string | null | undefined;

                if (config.normalizeModernColors) {
                    value = normalizeColorSyntax(value);
                }

                value = parseColorName(value, isGradient);

                if (COLOR_REGEXP.test(value)) {
                    if (isGradient) {
                        let match = COLOR_REGEXP_GLOBAL.exec(value);
                        while (match) {
                            gradientColors.push(match[0]);
                            match = COLOR_REGEXP_GLOBAL.exec(value);
                        }

                        gradientMixColor = mixColors(gradientColors);
                    }

                    let replaceIndex = 0;
                    value = value
                        .replace(COLOR_REGEXP_GLOBAL, (match) => {
                            let colorMatch: string | Color | null = match;

                            if (isGradient) {
                                colorMatch = gradientMixColor ?? null;
                                cssChanged = true;
                            }

                            const matchColor = ColorParser(colorMatch);

                            if (
                                matchColor &&
                                matchColor.alpha() >= IGNORE_ALPHA
                            ) {
                                const result = this.adjustBrightness(
                                    matchColor,
                                    el,
                                    {
                                        isBgColor: isBackgroundColor,
                                        isTextShadow,
                                        isTextColor: textColorIndex > -1,
                                        isBorderColor,
                                        hasInlineColor,
                                    },
                                    isUpdate,
                                    needReset
                                );

                                const newColor =
                                    !hasInlineBackgroundImage &&
                                    result.newColor;

                                extraStyle += result.extStyle;

                                if (isBackgroundColor || textColorIndex >= 5) {
                                    const newColorString = newColor
                                        ? newColor.toString()
                                        : colorMatch;

                                    if (replaceIndex === 0) {
                                        const states = getChildrenAndIt(el).map(
                                            (child) => ({
                                                child,
                                                state: this.getState(child),
                                            })
                                        );

                                        states.forEach(({ state }) => {
                                            if (isBackgroundColor) {
                                                state.bgColor =
                                                    newColorString as
                                                        string | Color;

                                                state.originalBgColor = (
                                                    state.originalBgColor ||
                                                    config.defaultLightBgColor
                                                )
                                                    .split(BG_COLOR_DELIMITER)
                                                    .concat(
                                                        colorMatch as string
                                                    )
                                                    .join(BG_COLOR_DELIMITER);
                                            } else {
                                                state.color = newColorString as
                                                    string | Color;
                                                state.originalColor =
                                                    colorMatch as
                                                        string | Color;
                                            }

                                            const parsedNewColor =
                                                ColorParser(newColorString);

                                            if (
                                                isBackgroundColor &&
                                                parsedNewColor &&
                                                parsedNewColor.alpha() >=
                                                    IGNORE_ALPHA &&
                                                state.bgImage
                                            ) {
                                                delete state.bgImage;
                                            }
                                        });
                                    }
                                }

                                if (newColor) {
                                    cssChanged = true;
                                }

                                replaceIndex++;
                                return (
                                    newColor ? newColor.toString() : colorMatch
                                ) as string;
                            }

                            return colorMatch as string;
                        })
                        .replace(/\s?!\s?important/gi, '');
                }

                if (extraStyle) {
                    cssKeyValues += extraStyle;
                }

                if (!(el instanceof this.context.window.SVGElement)) {
                    const isBackgroundProperty = /^background/.test(key);
                    const isBorderImageProperty =
                        /^(-webkit-)?border-image/.test(key);

                    if (
                        (isBackgroundProperty || isBorderImageProperty) &&
                        /url\([^)]*\)/i.test(value)
                    ) {
                        cssChanged = true;

                        const state = this.getState(el);
                        const mixedImageColor = mixColors(
                            (
                                state.originalBgColor ||
                                config.defaultLightBgColor
                            ).split(BG_COLOR_DELIMITER),
                            'normal'
                        );
                        const imageBackgroundColor =
                            mixedImageColor!.toString();

                        value = value.replace(
                            /^(.*?)url\(([^)]*)\)(.*)$/i,
                            (match) => {
                                let temporaryCss = '';

                                if (!state.bgImage) {
                                    getChildrenAndIt(el).forEach((child) => {
                                        this.getState(child).bgImage = true;
                                    });
                                }

                                if (isBackgroundProperty) {
                                    temporaryCss = cssWriter.genCssKV(
                                        key,
                                        imageBackgroundColor
                                            ? `${match},linear-gradient(${imageBackgroundColor}, ${imageBackgroundColor})`
                                            : match
                                    );

                                    if (backgroundPosition) {
                                        cssKeyValues += cssWriter.genCssKV(
                                            'background-position',
                                            backgroundPosition
                                        );
                                        temporaryCss += cssWriter.genCssKV(
                                            'background-position',
                                            imageBackgroundColor
                                                ? `${backgroundPosition},top left`
                                                : backgroundPosition
                                        );
                                    }

                                    if (backgroundSize) {
                                        cssKeyValues += cssWriter.genCssKV(
                                            'background-size',
                                            backgroundSize
                                        );
                                        temporaryCss += cssWriter.genCssKV(
                                            'background-size',
                                            imageBackgroundColor
                                                ? `${backgroundSize},100%`
                                                : backgroundSize
                                        );
                                    }

                                    if (!needReset) {
                                        const setComplementaryColor = () => {
                                            getChildrenAndIt(el).forEach(
                                                (child) => {
                                                    this.getState(
                                                        child
                                                    ).complementaryBgImageColor =
                                                        imageBackgroundColor ||
                                                        match;
                                                }
                                            );
                                        };

                                        if (darkModeBackgroundClassName) {
                                            backgroundCss += cssWriter.genCss(
                                                darkModeBackgroundClassName,
                                                temporaryCss
                                            );
                                            setComplementaryColor();
                                        } else {
                                            backgroundStack.push(
                                                el,
                                                temporaryCss,
                                                setComplementaryColor
                                            );
                                        }
                                    }
                                } else if (
                                    imageBackgroundColor &&
                                    !hasInlineBackground &&
                                    !needReset
                                ) {
                                    temporaryCss = cssWriter.genCssKV(
                                        'background-image',
                                        `linear-gradient(${imageBackgroundColor}, ${imageBackgroundColor})`
                                    );

                                    if (darkModeBackgroundClassName) {
                                        backgroundCss += cssWriter.genCss(
                                            darkModeBackgroundClassName,
                                            temporaryCss
                                        );
                                    } else {
                                        backgroundStack.push(el, temporaryCss);
                                    }
                                }

                                return match;
                            }
                        );

                        if (!hasInlineColor) {
                            const textColor =
                                state.originalColor ||
                                config.defaultLightTextColor;

                            cssKeyValues += cssWriter.genCssKV(
                                'color',
                                textColor as string
                            );

                            getChildrenAndIt(el).forEach((child) => {
                                this.getState(child).color = textColor;
                            });
                        }
                    }
                }

                if (cssChanged || needReset) {
                    if (
                        !isUpdate &&
                        !needReset &&
                        IMPORTANT_REGEXP.test(originalValue)
                    ) {
                        this.setStyleProperty(
                            styles,
                            key,
                            originalValue.replace(IMPORTANT_REGEXP, '')
                        );
                    }

                    if (isGradient) {
                        if (!needReset) {
                            if (darkModeBackgroundClassName) {
                                backgroundCss += cssWriter.genCss(
                                    darkModeBackgroundClassName,
                                    cssWriter.genCssKV(key, value)
                                );

                                if (
                                    /^background/.test(key) &&
                                    !/url\([^)]*\)/i.test(value)
                                ) {
                                    css += this.updateBackgroundWithGradient(
                                        gradientMixColor!,
                                        el,
                                        darkModeBackgroundClassName,
                                        properties,
                                        hasInlineColor,
                                        isUpdate,
                                        needReset
                                    );
                                }
                            } else {
                                backgroundStack.push(
                                    el,
                                    cssWriter.genCssKV(key, value),
                                    (item) => {
                                        if (
                                            /^background/.test(key) &&
                                            !/url\([^)]*\)/i.test(value)
                                        ) {
                                            css +=
                                                this.updateBackgroundWithGradient(
                                                    gradientMixColor!,
                                                    el,
                                                    item.className,
                                                    properties,
                                                    hasInlineColor,
                                                    isUpdate,
                                                    needReset
                                                );
                                        }
                                    }
                                );
                            }
                        }
                    } else {
                        if (key === 'color') {
                            noColor = false;
                            cssWriter.unwatch('color');
                        }

                        cssKeyValues += cssWriter.genCssKV(
                            key,
                            !cssChanged &&
                                needReset &&
                                !config.normalizeModernColors
                                ? this.getStyleProperty(styles, key)
                                : value
                        );
                    }
                }
            })
        );

        if (noColor) {
            cssKeyValues += cssWriter.genCssKV(
                'color',
                (styles.color ||
                    this.state.get(el)?.color ||
                    config.defaultDarkTextColor) as string
            );
            cssWriter.unwatch('color');
        }

        if (cssKeyValues) {
            if (!darkModeClassName) {
                darkModeClassName = `${CLASS_PREFIX}${this.index++}`;
                el.classList.add(darkModeClassName);
            }

            css += cssWriter.genCss(darkModeClassName, cssKeyValues);
        }

        css += backgroundCss;

        if (!isUpdate && hasTextNode(el) && !needReset) {
            if (config.delayBgJudge) {
                textQueue.push(el);
            } else {
                backgroundStack.contains(el, (item: BackgroundNode) => {
                    css += cssWriter.genCss(item.className, item.cssKV);
                    item.cb?.(item);
                });
            }
        }

        return css;
    }

    private adjustBrightness(
        color: Color,
        el: HTMLElement,
        options: AdjustBrightnessOptions,
        isUpdate: boolean,
        needReset: boolean
    ): AdjustBrightnessResult {
        const { config, css } = this.context;
        const state = this.getState(el);
        const alpha = color.alpha();
        let newColor: Color | undefined;
        let extStyle = '';

        if (options.isBgColor) {
            if (alpha >= IGNORE_ALPHA) {
                if (state.bgImage) delete state.bgImage;

                if (state.complementaryBgImageColor) {
                    if (
                        state.complementaryBgImageColor === color.toString() ||
                        this.getContrast(
                            state.complementaryBgImageColor,
                            color.toString()
                        ) < 1.1
                    ) {
                        return {
                            newColor: needReset ? color.toString() : '',
                            extStyle,
                        };
                    }

                    getChildrenAndIt(el).forEach((child) => {
                        delete this.getState(child).complementaryBgImageColor;
                    });
                }
            }

            newColor = this.adjustBackgroundBrightness(color);

            if (!options.hasInlineColor) {
                const parentTextColorString =
                    state.originalColor || config.defaultLightTextColor;
                const parentTextColor = ColorParser(parentTextColorString);

                if (parentTextColor) {
                    const result = this.adjustBrightness(
                        parentTextColor,
                        el,
                        {
                            isTextColor: true,
                            parentElementBgColorStr: newColor || color,
                        },
                        isUpdate,
                        needReset
                    );

                    extStyle += css.genCssKV(
                        'color',
                        result.newColor
                            ? result.newColor.toString()
                            : parentTextColor.toString()
                    );
                }
            }
        } else if (options.isTextColor || options.isBorderColor) {
            const parentBackgroundColorString =
                options.parentElementBgColorStr ||
                (options.isTextColor && state.bgColor) ||
                config.defaultDarkBgColor;
            const parentBackgroundColor = ColorParser(
                parentBackgroundColorString
            );

            if (parentBackgroundColor && !state.bgImage) {
                newColor = this.adjustTextBrightness(
                    color,
                    parentBackgroundColor
                );
            }
        } else if (options.isTextShadow) {
            if (!state.bgImage) {
                newColor = this.adjustBackgroundBrightness(color);
            }
        }

        return {
            newColor:
                newColor &&
                color.toString() !== newColor.toString() &&
                newColor.alpha(alpha).rgb(),
            extStyle,
        };
    }

    private adjustTextBrightness(textColor: Color, bgColor: Color): Color {
        const bgColorRgb = bgColor.rgb().array();
        const bgColorAlpha = bgColor.alpha();
        const bgColorPerceivedBrightness =
            getColorPerceivedBrightness(bgColorRgb);
        const bgColorWithOpacityPerceivedBrightness =
            bgColorPerceivedBrightness * bgColorAlpha +
            this.defaultDarkBgColorBrightness * (1 - bgColorAlpha);
        const textColorRgb = textColor.rgb().array();
        const textColorHsl = textColor.hsl().array();
        const textColorAlpha = textColor.alpha();
        const textPerceivedBrightness =
            getColorPerceivedBrightness(textColorRgb);
        const offsetPerceivedBrightness = Math.abs(
            bgColorWithOpacityPerceivedBrightness - textPerceivedBrightness
        );

        if (textPerceivedBrightness >= WHITE_LIKE_COLOR_BRIGHTNESS) {
            return textColor;
        }

        if (
            offsetPerceivedBrightness > this.maxLimitOffsetBrightness &&
            bgColorWithOpacityPerceivedBrightness <=
                this.defaultDarkBgColorBrightness + 2
        ) {
            return adjustBrightnessTo(
                this.maxLimitOffsetBrightness +
                    bgColorWithOpacityPerceivedBrightness,
                textColorRgb
            ).alpha(textColorAlpha);
        }

        if (offsetPerceivedBrightness >= MIN_LIMIT_OFFSET_BRIGHTNESS) {
            return textColor;
        }

        if (bgColorWithOpacityPerceivedBrightness >= HIGH_BGCOLOR_BRIGHTNESS) {
            if (textColorHsl[2] > 90 - HIGH_BLACKWHITE_HSL_BRIGHTNESS) {
                textColorHsl[2] = 90 - textColorHsl[2];
                const temporaryTextColor = Color.hsl(
                    ...(textColorHsl as [number, number, number])
                ).alpha(textColorAlpha);

                return this.adjustTextBrightness(temporaryTextColor, bgColor);
            }

            return adjustBrightnessTo(
                Math.min(
                    this.maxLimitOffsetBrightness,
                    bgColorWithOpacityPerceivedBrightness -
                        MIN_LIMIT_OFFSET_BRIGHTNESS
                ),
                textColorRgb
            ).alpha(textColorAlpha);
        }

        if (textColorHsl[2] <= HIGH_BLACKWHITE_HSL_BRIGHTNESS) {
            textColorHsl[2] = 90 - textColorHsl[2];
            const temporaryTextColor = Color.hsl(
                ...(textColorHsl as [number, number, number])
            ).alpha(textColorAlpha);

            return this.adjustTextBrightness(temporaryTextColor, bgColor);
        }

        return adjustBrightnessTo(
            Math.min(
                this.maxLimitOffsetBrightness,
                bgColorWithOpacityPerceivedBrightness +
                    MIN_LIMIT_OFFSET_BRIGHTNESS
            ),
            textColorRgb
        ).alpha(textColorAlpha);
    }

    private adjustBackgroundBrightness(bgColor: Color): Color {
        const bgColorRgb = bgColor.rgb().array();
        const bgColorHsl = bgColor.hsl().array();
        const bgColorAlpha = bgColor.alpha();
        const bgColorPerceivedBrightness =
            getColorPerceivedBrightness(bgColorRgb);
        let newColor = bgColor;

        if (
            (bgColorHsl[1] === 0 &&
                bgColorHsl[2] > HIGH_BLACKWHITE_HSL_BRIGHTNESS) ||
            bgColorPerceivedBrightness > WHITE_LIKE_COLOR_BRIGHTNESS
        ) {
            newColor = Color.hsl(
                0,
                0,
                Math.min(
                    100,
                    100 + this.defaultDarkBgColorHslBrightness - bgColorHsl[2]
                )
            );
        } else if (bgColorPerceivedBrightness > MAX_LIMIT_BGCOLOR_BRIGHTNESS) {
            newColor = adjustBrightnessTo(
                MAX_LIMIT_BGCOLOR_BRIGHTNESS,
                bgColorRgb
            ).alpha(bgColorAlpha);
        } else if (bgColorHsl[2] < LOW_BLACKWHITE_HSL_BRIGHTNESS) {
            bgColorHsl[2] = LOW_BLACKWHITE_HSL_BRIGHTNESS;
            newColor = Color.hsl(...(bgColorHsl as [number, number, number]));
        }

        return newColor.alpha(bgColorAlpha).rgb();
    }

    private updateBackgroundWithGradient(
        gradientColor: Color | string,
        el: HTMLElement,
        className: string,
        properties: StyleEntry[],
        hasInlineColor: boolean,
        isUpdate: boolean,
        needReset: boolean
    ): string {
        const { config, css } = this.context;
        const state = this.getState(el);
        const newBackgroundColor = mixColors(
            [state.bgColor || config.defaultDarkBgColor, gradientColor],
            'normal'
        );
        const newOriginalBackgroundColor = (
            state.originalBgColor || config.defaultLightBgColor
        )
            .split(BG_COLOR_DELIMITER)
            .concat(gradientColor.toString())
            .join(BG_COLOR_DELIMITER);

        getChildrenAndIt(el).forEach((child) => {
            const childState = this.getState(child);
            childState.bgColor = newBackgroundColor as string | Color;
            childState.originalBgColor = newOriginalBackgroundColor;
        });

        const lastProperty = properties.slice(-1)[0];
        if (lastProperty[0] === 'color') {
            const result = this.adjustBrightness(
                ColorParser(parseColorName(lastProperty[1]))!,
                el,
                {
                    isBgColor: false,
                    isTextShadow: false,
                    isTextColor: true,
                    isBorderColor: false,
                    hasInlineColor,
                },
                isUpdate,
                needReset
            );

            if (result.newColor) {
                return css.genCss(
                    className,
                    css.genCssKV('color', result.newColor.toString())
                );
            }
        }

        return '';
    }

    private parseInlineStyles(styles: CSSStyleDeclaration): StyleEntry[] {
        if (!styles.cssText) return [];

        return styles.cssText
            .replace(
                /("[^;]*);([^;]*")|('[^;]*);([^;]*')/g,
                `$1$3${SEMICOLON_PLACEHOLDER}$2$4`
            )
            .split(';')
            .map((cssString) => {
                const splitIndex = cssString.indexOf(':');
                const key = cssString.slice(0, splitIndex).toLowerCase();
                const value = cssString
                    .slice(splitIndex + 1)
                    .replace(SEMICOLON_PLACEHOLDER_REGEXP, ';');

                return [key, value].map((item) =>
                    item.replace(/^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g, '')
                ) as StyleEntry;
            });
    }

    private getState(el: Element): ElementState {
        let state = this.state.get(el);

        if (!state) {
            state = {};
            this.state.set(el, state);
        }

        return state;
    }

    private copyStateValue<K extends keyof ElementState>(
        target: ElementState,
        key: K,
        value: ElementState[K] | null | undefined
    ): void {
        if (value === null || value === undefined) {
            delete target[key];
        } else {
            target[key] = value;
        }
    }

    private getStyleProperty(styles: CSSStyleDeclaration, key: string): string {
        return (styles as unknown as Record<string, string>)[key] ?? '';
    }

    private setStyleProperty(
        styles: CSSStyleDeclaration,
        key: string,
        value: string
    ): void {
        (styles as unknown as Record<string, string>)[key] = value;
    }

    private tryRun<T>(callback: () => T): T | undefined {
        try {
            return callback();
        } catch (error) {
            console.log(
                'An error occurred when running the dark mode conversion algorithm\n',
                error
            );
            const { error: errorHandler } = this.context.config;
            if (typeof errorHandler === 'function') {
                errorHandler(error);
            }
            return undefined;
        }
    }
}
