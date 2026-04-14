import { get, writable } from "svelte/store"
import { getCssVariablesFromColors, type ArticleColors } from "./ColorTheme";
import * as Color from "colorjs.io/fn";

import * as emmm from '@the_dissidents/libemmm';
import { convertFileSrc } from "@tauri-apps/api/core";
import { CustomHTMLRenderer } from "./emmm/Custom";
import type { EmmmParseData } from "./editor/ParseData";
import type { EditorHandleOut } from "./editor/Editor.svelte";
import { Memorized } from "./config/Memorized.svelte";

import * as z from "zod/v4-mini";

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
let progress = writable<number | undefined>();

import testStyles from '../template/typesetting.css?raw';
import testString from '../template/testsource.txt?raw';
import testLib from '../template/testlib.txt?raw';
import { Debug } from "./Debug";

export const defaultSource = testString;

let renderTimer: any;

function getId(n: Node | null) {
    while (n) {
        if (n instanceof HTMLElement) {
            if (n.dataset.id !== undefined)
                return n.dataset.id;
        }
        n = n?.parentElement;
    }
    return undefined;
}

export const Interface = $state({
    get status() { return status; },
    get parseData() { return parseData; },

    get progress() { return progress; },

    stylesheet: Memorized.$('stylesheet', z.string(), testStyles),
    source: Memorized.$('source', z.string(), testString),
    library: Memorized.$('library', z.string(), testLib),

    invertedPreview: Memorized.$('invertedPreview', z.boolean(), false),
    syncScrolling: Memorized.$('syncScrolling', z.boolean(), true),

    activeEditor: undefined as EditorHandleOut | undefined,
    sourceEditor: undefined as EditorHandleOut | undefined,

    frame: undefined as HTMLIFrameElement | undefined,
    renderedDocument: null as Document | null,
    sourceMap: [] as emmm.HTMLSourceMapEntry[],

    colors: {
        theme: Color.getColor('white'),
        text: Color.getColor('black'),
        commentary: Color.getColor('indianred'),
        link: Color.getColor('MediumVioletRed'),
        highlight: Color.getColor('yellow')
    } satisfies ArticleColors,
    onFrameDOMLoaded: new EventHost(),
    onFrameLoaded: new EventHost(),

    requestRender(t = 500) {
        if (!renderTimer)
            renderTimer = setTimeout(() => {
                renderTimer = undefined;
                this.render();
            }, t);
    },

    scrollToSource(pos: number, select: boolean) {
        Debug.assert(!!this.frame);

        const doc = this.frame.contentDocument!;
        const window = this.frame.contentWindow!;

        const ranges = this.sourceMap
            .filter((x) => x.start <= pos && x.end >= pos);
        if (ranges.length == 0) {
            if (select)
                doc.getSelection()!.removeAllRanges();
            return;
        }

        let mostSpecific = ranges[0];
        for (const r of ranges)
            if (r.end - r.start < mostSpecific.end - mostSpecific.start)
                mostSpecific = r;

        const elem = doc.querySelector(`[data-id="${CSS.escape(mostSpecific.id)}"]`);
        Debug.assert(!!elem);

        const lx = pos; //sourceHandle!.resolvePosition(pos)[0];
        const l1 = mostSpecific.start; //sourceHandle!.resolvePosition(mostSpecific.start)[0];
        const l2 = mostSpecific.end; //sourceHandle!.resolvePosition(mostSpecific.end)[0];

        if (l2 > l1) {
            const rect = elem.getBoundingClientRect();
            const y = (lx - l1) / (l2 - l1) * rect.height
                + rect.top + window.scrollY - window.innerHeight / 2;
            window.scrollTo({ top: y, behavior: 'smooth' });
        } else {
            elem.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        if (select) {
            const selection = doc.getSelection()!;
            selection.removeAllRanges();
            const range = doc.createRange();
            range.selectNodeContents(elem);
            selection.addRange(range);
        }
    },

    async render() {
        const pd = get(parseData)?.data;
        if (!pd || !this.frame) return;
        let renderConfig = emmm.RenderConfiguration.from(CustomHTMLRenderer);
        renderConfig.options.transformAsset = (url) => {
            // FIXME: shaky
            if (!url.startsWith('file:')) return undefined;
            return convertFileSrc(url.substring(5));
        };
        const state = new emmm.HTMLRenderState();
        state.cssVariables = getCssVariablesFromColors(this.colors, 'srgb');
        state.stylesheet = this.stylesheet.get();
        this.renderedDocument = await renderConfig.render(pd, state);
        this.sourceMap = state.sourceMap;

        const sx = this.frame.contentWindow!.scrollX;
        const sy = this.frame.contentWindow!.scrollY;
        this.frame.srcdoc = this.renderedDocument.documentElement.outerHTML;
        this.frame.addEventListener(
            'load', () => {
                this.frame!.contentWindow!.scrollTo(sx, sy);
                this.onFrameLoaded.dispatch();
            }, { once: true });

        // you can't listen to things inside the iframe

        // this.frame.contentWindow!.document.addEventListener(
        //     'DOMContentLoaded', () => {
        //         this.onFrameDOMLoaded.dispatch();
        //     });

        // const doc = this.frame.contentDocument!;
        // doc.addEventListener('selectionchange', () => {
        //     const sel = doc.getSelection()!;
        //     const n = sel.anchorNode;
        //     const id = getId(n);
        //     if (id === undefined) return;
        //     const entry = this.sourceMap.find((x) => x.id == id);
        //     if (!entry) return;
        //     this.sourceEditor?.setSelections([{ from: entry.start, to: entry.end }]);
        // });
    }
});
