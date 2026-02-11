import * as Color from "colorjs.io/fn";

export type ArticleColors = {
    theme: Color.PlainColorObject,
    text: Color.PlainColorObject,
    commentary: Color.PlainColorObject,
    link: Color.PlainColorObject,
    highlight: Color.PlainColorObject
};

export function getCssVariablesFromColors(t: ArticleColors, to: string | undefined = 'srgb') {
    let f = to
        ? (x: Color.PlainColorObject) => Color.serialize(Color.toGamut(x, to))
        : (x: Color.PlainColorObject) => Color.serialize(x);
    return new Map([
        ['theme-color', f(t.theme)],
        ['text-color', f(t.text)],
        ['link-color', f(t.link)],
        ['note-color', f(t.commentary)],
        ['commentary-color', f(t.commentary)],
        ['separator-color', f(t.commentary)],
        ['highlight-color', f(t.highlight)],
    ]);
}

// export function deriveColorsFrom(theme: Color.PlainColorObject): ArticleColors {
//     function f(x: number, a: number, b: number) {
//         return Math.pow(x, a) * b;
//     }

//     function invf(x: number, a: number, b: number) {
//         return Math.pow(x, 1/a) * b + (1 - b);
//     }

//     const themeHsl = Color.to(theme, 'hsl');
//     if (themeHsl.coords[2] && themeHsl.coords[2] > 50) {
//         let text = themeHsl;
//         text.coords[1] = Math.pow((text.coords[1] ?? 0) / 100, 0.8) * 100;
//         text.coords[2] = 10;

//         let commentary = themeHsl;
//         commentary.s = f((commentary.s ?? 0) / 100, 1.5, 0.6) * 100;
//         commentary.l = f((commentary.l ?? 0) / 100, 0.6, 0.5) * 100;
//         commentary.oklch.l = invf((text.oklch.l ?? 0), 1, 0.7);

//         let link = themeHsl;
//         link.s = f((link.s ?? 0) / 100, 1, 0.6) * 100;
//         link.l = f((link.l ?? 0) / 100, 0.5, 0.6) * 100;
//         link.oklch.h = ((link.oklch.h ?? 0) + 20) % 360;
//         link.oklch.l = invf((text.oklch.l ?? 0), 1, 0.6);

//         let highlight = theme.to('hsl');
//         highlight.s = f((highlight.s ?? 0) / 100, 0.7, 1) * 100;
//         highlight.l = f((highlight.l ?? 0) / 100, 1, 0.9) * 100;
//         highlight.oklch.h = ((highlight.oklch.h ?? 0) - 25) % 360;
//         highlight.oklch.l = f((theme.oklch.l ?? 0), 0.9, 0.9);

//         return {theme, text, commentary, link, highlight};
//     } else {
//         let text = theme.to('hsl');
//         text.s = Math.pow((text.s ?? 0) / 100, 1.25) * 100;
//         text.l = 95;

//         let commentary = theme.to('hsl');
//         commentary.s = f((commentary.s ?? 0) / 100, 1.5, 0.6) * 100;
//         commentary.l = invf((commentary.l ?? 0) / 100, 0.6, 0.5) * 100;
//         commentary.oklch.l = f((text.oklch.l ?? 0), 1, 0.8);

//         let link = theme.to('hsl');
//         link.s = f((link.s ?? 0) / 100, 1, 0.6) * 100;
//         link.l = invf((link.l ?? 0) / 100, 0.5, 0.6) * 100;
//         link.oklch.h = ((link.oklch.h ?? 0) + 20) % 360;
//         link.oklch.l = f((text.oklch.l ?? 0), 1, 0.9);

//         let highlight = theme.to('hsl');
//         highlight.s = f((highlight.s ?? 0) / 100, 0.7, 1) * 100;
//         highlight.l = invf((highlight.l ?? 0) / 100, 1, 0.9) * 100;
//         highlight.oklch.h = ((highlight.oklch.h ?? 0) - 25) % 360;
//         highlight.oklch.l = invf((theme.oklch.l ?? 0), 0.9, 0.7);

//         return {theme, text, commentary, link, highlight};
//     }
// }
