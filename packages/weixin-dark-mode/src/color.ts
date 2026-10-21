import Color from 'color';
import ColorName from 'color-name';
import ColorJS from 'colorjs.io';
import * as ColorBlend from 'color-blend';

import { COLOR_REGEXP, IMPORTANT_REGEXP } from './constants.js';

type Rgb = [number, number, number];
type ColorBlendObject = { r: number; g: number; b: number; a: number };
export type BlendMode = keyof typeof ColorBlend;
export type MixType = 'mix' | BlendMode;

const colorNames = Object.fromEntries(
    Object.entries(ColorName).map(([name, value]) => [
        name,
        [...(value as number[])],
    ])
) as Record<string, number[]>;

colorNames.windowtext = [0, 0, 0];
colorNames.transparent = [255, 255, 255, 0];

const COLOR_FUNCTION_REGEXP =
    /\b(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color)\([^()]*\)/gi;

const COLOR_NAME_REGEXP = new RegExp(
    Object.keys(colorNames)
        .map((name) => `\\b${name}\\b`)
        .join('|'),
    'ig'
);

function toColorBlend(color: Color): ColorBlendObject {
    const obj = color.object() as ColorBlendObject & { alpha?: number };
    obj.a = obj.alpha || 1;
    delete obj.alpha;
    return obj;
}

function fromColorBlend(colorBlend: ColorBlendObject): Color | null {
    const { a, ...rgb } = colorBlend;
    return ColorParser({ ...rgb, alpha: a });
}

export function ColorParser(value: unknown): Color | null {
    try {
        return value instanceof Color ? value : Color(value as never);
    } catch (error) {
        console.log(`ignore the invalid color: \`${String(value)}\``);
        return null;
    }
}

export function parseColorName(
    value: string,
    supportTransparent = false
): string {
    return value
        .replace(IMPORTANT_REGEXP, '')
        .replace(COLOR_NAME_REGEXP, (match) => {
            if (!supportTransparent && match === 'transparent') return match;

            const color = colorNames[match.toLowerCase()];
            return `${color.length > 3 ? 'rgba' : 'rgb'}(${color.toString()})`;
        });
}

export function normalizeColorSyntax(value: string): string {
    return value.replace(COLOR_FUNCTION_REGEXP, (token) => {
        try {
            const color = new ColorJS(token).to('srgb');
            const [red, green, blue] = color.coords.map((coordinate) => {
                const numeric = Number(coordinate);
                const normalized = Number.isFinite(numeric) ? numeric : 0;
                return Math.round(Math.min(1, Math.max(0, normalized)) * 255);
            });
            const rawAlpha = Number(color.alpha);
            const alpha = Number.isFinite(rawAlpha)
                ? Math.min(1, Math.max(0, rawAlpha))
                : 1;

            if (alpha < 1) {
                const roundedAlpha = Math.round(alpha * 1000) / 1000;
                return `rgba(${red}, ${green}, ${blue}, ${roundedAlpha})`;
            }

            return `rgb(${red}, ${green}, ${blue})`;
        } catch {
            return token;
        }
    });
}

export function parseWebkitFillColorAndStrokeColor(value: string): string {
    const newValue = parseColorName(value);
    return COLOR_REGEXP.test(newValue) ? newValue : '';
}

export function mixColors(
    colors: Array<string | Color>,
    type: MixType = 'mix'
): Color | string | null {
    if (!Array.isArray(colors) || colors.length < 1) return null;
    if (colors.length === 1) return colors[0];

    let index = 0;
    let color1 = ColorParser(colors[index++]);
    let color2 = ColorParser(colors[index++]);

    while (color2) {
        if (!color1 && color2) {
            color1 = color2;
        } else if (!color1 && !color2) {
            if (colors.length === index) break;
            color1 = ColorParser(colors[index++]);
        } else if (color1 && color2) {
            color1 =
                type === 'mix'
                    ? color1.mix(color2, color2.alpha())
                    : fromColorBlend(
                          (
                              ColorBlend[type] as (
                                  a: ColorBlendObject,
                                  b: ColorBlendObject
                              ) => ColorBlendObject
                          )(toColorBlend(color1), toColorBlend(color2))
                      );
        }

        if (colors.length === index) break;
        color2 = ColorParser(colors[index++]);
    }

    return color1 || null;
}

export function getColorPerceivedBrightness(rgb: Rgb | number[]): number {
    return (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000;
}

export function adjustBrightnessTo(target: number, rgb: number[]): Color {
    const relativeBrightnessRatio = target / getColorPerceivedBrightness(rgb);
    let newTextR = Math.min(255, rgb[0] * relativeBrightnessRatio);
    let newTextG = Math.min(255, rgb[1] * relativeBrightnessRatio);
    let newTextB = Math.min(255, rgb[2] * relativeBrightnessRatio);

    if (newTextG === 0 || newTextR === 255 || newTextB === 255) {
        newTextG = (target * 1000 - newTextR * 299 - newTextB * 114) / 587;
    } else if (newTextR === 0) {
        newTextR = (target * 1000 - newTextG * 587 - newTextB * 114) / 299;
    } else if (newTextB === 0 || newTextG === 255) {
        newTextB = (target * 1000 - newTextR * 299 - newTextG * 587) / 114;
    }

    return Color.rgb(newTextR, newTextG, newTextB);
}
