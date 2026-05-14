import * as Color from 'colorjs.io/fn';

export type ArticleColors = {
    theme: Color.PlainColorObject;
    text: Color.PlainColorObject;
    commentary: Color.PlainColorObject;
    link: Color.PlainColorObject;
    highlight: Color.PlainColorObject;
};

export function getCssVariablesFromColors(
    t: ArticleColors,
    to: string | undefined = 'srgb'
) {
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

export function deriveColorsFrom(theme: Color.PlainColorObject): ArticleColors {
    function f(x: number, a: number, b: number) {
        return Math.pow(x, a) * b;
    }

    function invf(x: number, a: number, b: number) {
        return Math.pow(x, 1 / a) * b + (1 - b);
    }

    const themeHsl = Color.to(theme, 'hsl');
    if (themeHsl.coords[2] && themeHsl.coords[2] > 50) {
        const text = Color.clone(themeHsl);
        text.coords[1] = Math.pow((text.coords[1] ?? 0) / 100, 0.8) * 100;
        text.coords[2] = 10;

        const commentary = Color.clone(themeHsl);
        commentary.coords[1] =
            f((commentary.coords[1] ?? 0) / 100, 1.5, 0.6) * 100;
        commentary.coords[2] =
            f((commentary.coords[2] ?? 0) / 100, 0.6, 0.5) * 100;
        const commentaryOklch = Color.to(commentary, 'oklch');
        commentaryOklch.coords[0] = invf(
            Color.to(text, 'oklch').coords[0] ?? 0,
            1,
            0.7
        );

        const link = Color.clone(themeHsl);
        link.coords[1] = f((link.coords[1] ?? 0) / 100, 1, 0.6) * 100;
        link.coords[2] = f((link.coords[2] ?? 0) / 100, 0.5, 0.6) * 100;
        const linkOklch = Color.to(link, 'oklch');
        linkOklch.coords[2] = ((linkOklch.coords[2] ?? 0) + 20) % 360;
        linkOklch.coords[0] = invf(
            Color.to(text, 'oklch').coords[0] ?? 0,
            1,
            0.6
        );

        const highlight = Color.clone(themeHsl);
        highlight.coords[1] = f((highlight.coords[1] ?? 0) / 100, 0.7, 1) * 100;
        highlight.coords[2] = f((highlight.coords[2] ?? 0) / 100, 1, 0.9) * 100;
        const highlightOklch = Color.to(highlight, 'oklch');
        highlightOklch.coords[2] = ((highlightOklch.coords[2] ?? 0) - 25) % 360;
        highlightOklch.coords[0] = f(
            Color.to(theme, 'oklch').coords[0] ?? 0,
            0.9,
            0.9
        );

        return {
            theme,
            text,
            commentary: commentaryOklch,
            link: linkOklch,
            highlight: highlightOklch,
        };
    } else {
        const text = Color.clone(themeHsl);
        text.coords[1] = Math.pow((text.coords[1] ?? 0) / 100, 1.25) * 100;
        text.coords[2] = 95;

        const commentary = Color.clone(themeHsl);
        commentary.coords[1] =
            f((commentary.coords[1] ?? 0) / 100, 1.5, 0.6) * 100;
        commentary.coords[2] =
            invf((commentary.coords[2] ?? 0) / 100, 0.6, 0.5) * 100;
        const commentaryOklch = Color.to(commentary, 'oklch');
        commentaryOklch.coords[0] = f(
            Color.to(text, 'oklch').coords[0] ?? 0,
            1,
            0.8
        );

        const link = Color.clone(themeHsl);
        link.coords[1] = f((link.coords[1] ?? 0) / 100, 1, 0.6) * 100;
        link.coords[2] = invf((link.coords[2] ?? 0) / 100, 0.5, 0.6) * 100;
        const linkOklch = Color.to(link, 'oklch');
        linkOklch.coords[2] = ((linkOklch.coords[2] ?? 0) + 20) % 360;
        linkOklch.coords[0] = f(Color.to(text, 'oklch').coords[0] ?? 0, 1, 0.9);

        const highlight = Color.clone(themeHsl);
        highlight.coords[1] = f((highlight.coords[1] ?? 0) / 100, 0.7, 1) * 100;
        highlight.coords[2] =
            invf((highlight.coords[2] ?? 0) / 100, 1, 0.9) * 100;
        const highlightOklch = Color.to(highlight, 'oklch');
        highlightOklch.coords[2] = ((highlightOklch.coords[2] ?? 0) - 25) % 360;
        highlightOklch.coords[0] = invf(
            Color.to(theme, 'oklch').coords[0] ?? 0,
            0.9,
            0.7
        );

        return {
            theme,
            text,
            commentary: commentaryOklch,
            link: linkOklch,
            highlight: highlightOklch,
        };
    }
}
