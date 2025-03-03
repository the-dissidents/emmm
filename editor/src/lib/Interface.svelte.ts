import { get, writable } from "svelte/store"
import type { EmmmParseData } from "./EditorTheme";
import { getCssVariablesFromColors, type ArticleColors } from "./ColorTheme";
import Color from "colorjs.io";
import testStyles from './typesetting.css?raw';

import * as emmm from '@the_dissidents/libemmm';

export class EventHost<T extends unknown[] = []> {
    #listeners = new Set<(...args: [...T]) => void>;
    dispatch(...args: [...T]) {
        this.#listeners.forEach((x) => x(...args));
    };
    bind(f: (...args: [...T]) => void) {
        this.#listeners.add(f);
    }
    unbind(f: (...args: [...T]) => void) {
        this.#listeners.delete(f);
    }
}

let status = writable<string>('ok');
let parseData = writable<EmmmParseData | undefined>();

export const Interface = $state({
    get status() { return status; },
    get parseData() { return parseData; },

    frame: undefined as HTMLIFrameElement | undefined,
    renderedHTML: '',
    colors: {
        theme: new Color('pink'),
        text: new Color('black'),
        commentary: new Color('black'),
        link: new Color('black'),
        highlight: new Color('yellow')
    } satisfies ArticleColors,
    onFrameLoaded: new EventHost(),

    render() {
        const pd = get(parseData);
        if (!pd || !this.frame) return;
        let renderConfig = emmm.HTMLRenderConfiguration;
        let state = new emmm.HTMLRenderState();
        state.cssVariables = getCssVariablesFromColors(Interface.colors, 'srgb');
        state.stylesheet = testStyles;
        Interface.renderedHTML = renderConfig.render(pd.data, state);
        
        this.frame.addEventListener('load', function callback() {
            try {
                Interface.onFrameLoaded.dispatch();
            } finally {
                Interface.frame!.removeEventListener('load', callback);
            }
        });
    }
});