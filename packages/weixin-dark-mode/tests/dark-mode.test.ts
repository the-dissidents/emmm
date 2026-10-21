import { Window as HappyWindow } from 'happy-dom';
import { describe, expect, test } from 'vitest';

import { createDarkMode } from '../src/index.js';

function createWindow(markup: string): Window {
    const window = new HappyWindow({
        url: 'https://example.com/',
    }) as unknown as Window;
    window.document.body.innerHTML = markup;
    return window;
}

function findAll(window: Window): Element[] {
    return Array.from(window.document.body.querySelectorAll('*'));
}

function getStyles(window: Window): string {
    return Array.from(window.document.head.querySelectorAll('style'))
        .map((style) => style.textContent)
        .join('\n');
}

describe('weixin dark mode', () => {
    test('writes converted styles into the supplied window', () => {
        const window = createWindow(`
            <div id="container" style="color: rgb(0, 0, 0); background-color: rgb(255, 255, 255)">
                hello <span id="text" style="color: rgb(255, 0, 0)">red</span>
            </div>
        `);

        const darkMode = createDarkMode(window);
        darkMode.run(findAll(window), {
            mode: 'dark',
            needJudgeFirstPage: false,
        });

        const styles = getStyles(window);
        expect(styles).toContain(
            'html.data_color_scheme_dark .js_darkmode__0{background-color: rgb(25, 25, 25) !important;color: rgb(163, 163, 163) !important;}'
        );
        expect(styles).toContain(
            '.js_darkmode__1{color: rgb(255, 23, 0) !important;}'
        );
        expect(window.document.getElementById('container')?.className).toBe(
            'js_darkmode__0'
        );
    });

    test('keeps separate instances isolated', () => {
        const firstWindow = createWindow(
            '<div style="color: rgb(0, 0, 0)">first</div>'
        );
        const secondWindow = createWindow(
            '<div style="color: rgb(255, 0, 0)">second</div>'
        );

        createDarkMode(firstWindow).run(findAll(firstWindow), {
            mode: 'dark',
            needJudgeFirstPage: false,
        });
        createDarkMode(secondWindow).run(findAll(secondWindow), {
            mode: 'dark',
            needJudgeFirstPage: false,
        });

        expect(getStyles(firstWindow)).toContain('.js_darkmode__0{');
        expect(getStyles(secondWindow)).toContain('.js_darkmode__0{');
        expect(getStyles(firstWindow)).not.toBe(getStyles(secondWindow));
    });

    test('follows the supplied window media query when no mode is forced', () => {
        const window = createWindow(
            '<div style="color: rgb(0, 0, 0)">system</div>'
        );

        window.matchMedia = (() => ({
            matches: true,
            media: '(prefers-color-scheme: dark)',
            addListener: () => {},
            removeListener: () => {},
        })) as unknown as Window['matchMedia'];

        createDarkMode(window).run(findAll(window), {
            needJudgeFirstPage: false,
        });

        expect(getStyles(window)).toContain(
            '@media (prefers-color-scheme: dark) {'
        );
    });

    test('updates styles and reports contrast', () => {
        const window = createWindow(`
            <div style="color: rgb(0, 0, 0)">hello <span id="text">world</span></div>
        `);
        const darkMode = createDarkMode(window);

        darkMode.run(findAll(window), {
            mode: 'dark',
            needJudgeFirstPage: false,
        });

        const text = window.document.getElementById(
            'text'
        ) as unknown as HTMLElement;
        darkMode.updateStyle(text, { color: 'rgb(0, 128, 0)' });

        expect(window.document.head.querySelectorAll('style')).toHaveLength(2);
        expect(darkMode.getContrast('#fff', '#000')).toBe(21);
    });

    test('normalizes modern CSS colors when enabled', () => {
        const window = createWindow('<div id="target">text</div>');
        const darkMode = createDarkMode(window);

        darkMode.run(findAll(window), {
            mode: 'dark',
            needJudgeFirstPage: false,
            normalizeModernColors: true,
        });

        const target = window.document.getElementById(
            'target'
        ) as unknown as HTMLElement;

        darkMode.updateStyle(target, {
            color: 'color(srgb 0 0 0)',
            'background-color': 'color(srgb 1 1 1)',
        });

        const styles = getStyles(window);
        expect(styles).toContain('background-color: rgb(25, 25, 25)');
        expect(styles).toContain('color: rgb(163, 163, 163)');
    });

    test('ignores modern CSS colors by default', () => {
        const window = createWindow('<div id="target">text</div>');
        const darkMode = createDarkMode(window);

        darkMode.run(findAll(window), {
            mode: 'dark',
            needJudgeFirstPage: false,
        });

        const target = window.document.getElementById(
            'target'
        ) as unknown as HTMLElement;

        darkMode.updateStyle(target, {
            color: 'color(srgb 0 0 0)',
        });

        expect(getStyles(window)).toBe('');
    });

    test('manually switches between dark and light previews', () => {
        const window = createWindow(
            '<div style="color: rgb(0, 0, 0)">text</div>'
        );
        const darkMode = createDarkMode(window);

        darkMode.run(findAll(window), {
            mode: 'dark',
            needJudgeFirstPage: false,
        });

        const style = window.document.head.querySelector(
            'style'
        ) as HTMLStyleElement;

        expect(
            window.document.documentElement.classList.contains(
                'data_color_scheme_dark'
            )
        ).toBe(true);
        expect(style.media).toBe('');

        darkMode.setMode('light');
        expect(
            window.document.documentElement.classList.contains(
                'data_color_scheme_dark'
            )
        ).toBe(false);
        expect(style.media).toBe('not all');

        darkMode.setMode('dark');
        expect(style.media).toBe('');
    });

    test('can switch a light preview to dark', () => {
        const window = createWindow(
            '<div style="color: rgb(0, 0, 0)">text</div>'
        );
        const darkMode = createDarkMode(window);

        darkMode.run(findAll(window), {
            mode: 'light',
            needJudgeFirstPage: false,
        });

        expect(getStyles(window)).toBe('');

        darkMode.setMode('dark');

        expect(getStyles(window)).toContain('.js_darkmode__0{');
        expect(
            window.document.documentElement.classList.contains(
                'data_color_scheme_dark'
            )
        ).toBe(true);
    });

    test('does not convert in light mode', () => {
        const window = createWindow(
            '<div id="target" style="color: rgb(0, 0, 0)">light</div>'
        );

        createDarkMode(window).run(findAll(window), {
            mode: 'light',
            needJudgeFirstPage: false,
        });

        expect(getStyles(window)).toBe('');
        expect(window.document.getElementById('target')?.className).toBe('');
    });
});
