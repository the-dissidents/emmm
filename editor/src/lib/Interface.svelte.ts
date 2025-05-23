import { get, writable } from "svelte/store"
import type { EmmmParseData } from "./EditorTheme";
import { getCssVariablesFromColors, type ArticleColors } from "./ColorTheme";
import Color from "colorjs.io";
import testStyles from './typesetting.css?raw';

import * as emmm from '@the_dissidents/libemmm';
import { convertFileSrc } from "@tauri-apps/api/core";

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

let objUrl: string | undefined;

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
    onFrameDOMLoaded: new EventHost(),
    onFrameLoaded: new EventHost(),

    render() {
        const pd = get(parseData);
        if (!pd || !this.frame) return;
        let renderConfig = emmm.RenderConfiguration.from(emmm.HTMLRenderConfiguration);
        renderConfig.options.transformAsset = (url) => {
            if (url.protocol != 'file:') return undefined;
            return convertFileSrc(url.pathname);
        };
        let state = new emmm.HTMLRenderState();
        state.cssVariables = getCssVariablesFromColors(this.colors, 'srgb');
        state.stylesheet = testStyles;
        this.renderedHTML = renderConfig.render(pd.data, state);
        if (objUrl) URL.revokeObjectURL(objUrl);
        objUrl = URL.createObjectURL(new Blob([this.renderedHTML], { type: "text/html" }));
        this.frame.src = objUrl;
        // FIXME: this does not work
        this.frame.contentWindow!.document.addEventListener(
            'DOMContentLoaded', () => {
                // console.log('DOMContentLoaded');
                this.onFrameDOMLoaded.dispatch();
            });
        // this works
        this.frame.addEventListener(
            'load', () => {
                // console.log('window load');
                this.onFrameLoaded.dispatch();
            }, { once: true });
    }
});