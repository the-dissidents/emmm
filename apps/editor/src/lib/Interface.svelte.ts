import { get, writable } from "svelte/store"
import { getCssVariablesFromColors, type ArticleColors } from "./ColorTheme";
import Color from "colorjs.io";

import * as emmm from '@the_dissidents/libemmm';
import { convertFileSrc } from "@tauri-apps/api/core";
import { CustomHTMLRenderer } from "./emmm/Custom";
import type { EmmmParseData } from "./editor/ParseData";
import type { EditorHandleOut } from "./editor/Editor.svelte";

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

    stylesheet: '',
    activeEditor: undefined as EditorHandleOut | undefined,

    frame: undefined as HTMLIFrameElement | undefined,
    renderedDocument: null as Document | null,

    colors: {
        theme: new Color('white'),
        text: new Color('black'),
        commentary: new Color('black'),
        link: new Color('black'),
        highlight: new Color('yellow')
    } satisfies ArticleColors,
    onFrameDOMLoaded: new EventHost(),
    onFrameLoaded: new EventHost(),

    async render() {
        const pd = get(parseData)?.data;
        if (!pd || !this.frame) return;
        let renderConfig = emmm.RenderConfiguration.from(CustomHTMLRenderer);
        renderConfig.options.transformAsset = (url) => {
            // FIXME: shaky
            if (!url.startsWith('file:')) return undefined;
            return convertFileSrc(url.substring(5));
        };
        let state = new emmm.HTMLRenderState();
        state.cssVariables = getCssVariablesFromColors(this.colors, 'srgb');
        state.stylesheet = this.stylesheet;
        this.renderedDocument = await renderConfig.render(pd, state);
        const sx = this.frame.contentWindow!.scrollX;
        const sy = this.frame.contentWindow!.scrollY;
        this.frame.srcdoc = this.renderedDocument.documentElement.outerHTML;
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
                this.frame!.contentWindow!.scrollTo(sx, sy);
                this.onFrameLoaded.dispatch();
            }, { once: true });
    }
});
