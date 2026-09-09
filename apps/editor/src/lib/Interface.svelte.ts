import { get, writable } from "svelte/store"
import { ZArticleColors } from "./ColorTheme";
import * as Color from "colorjs.io/fn";

import * as emmm from '@the_dissidents/libemmm';
import type { EmmmParseData } from "./editor/ParseData";
import type Editor from "./editor/Editor.svelte";
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

import defaultStyles from '../template/stylesheet.scss?raw';
import _defaultSource from '../template/testsource.txt?raw';
import defaultLibrary from '../template/testlib.txt?raw';

import { Debug } from "./Debug";
import { renderDocument } from "./Document.svelte";

export const defaultSource = _defaultSource;

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


export async function guardAsync(x: () => Promise<void>, msg: string): Promise<void>;
export async function guardAsync<T>(x: () => Promise<T>, msg: string, fallback: T): Promise<T>;

export async function guardAsync<T>(x: () => Promise<T>, msg: string, fallback?: T) {
    try {
        return await x();
    } catch (x) {
        Interface.status.set(`${msg}: ${String(x)}`);
        console.info('guard:', msg, x);
        return fallback;
    };
}

type EnforceNotPromise<T extends () => unknown> =
    ReturnType<T> extends Promise<unknown> ? never : T;

export function guard<T extends () => void>(x: EnforceNotPromise<T>, msg: string): void;
export function guard<T extends () => unknown>(
    x: EnforceNotPromise<T>, msg: string, fallback: ReturnType<T>): ReturnType<T>;

export function guard<T>(x: () => T, msg: string, fallback?: T) {
    try {
        return x();
    } catch (x) {
        Interface.status.set(`${msg}: ${String(x)}`);
        console.info('guard:', msg, x);
        return fallback;
    };
}

export const Interface = $state({
    get status() { return status; },
    get parseData() { return parseData; },

    get progress() { return progress; },

    stylesheet: Memorized.$('stylesheet', z.string(), defaultStyles),
    source: Memorized.$('source', z.string(), defaultSource),
    library: Memorized.$('library', z.string(), defaultLibrary),

    invertedPreview: Memorized.$('invertedPreview', z.boolean(), false),
    syncScrolling: Memorized.$('syncScrolling', z.boolean(), false),

    activeEditor: undefined as Editor | undefined,
    sourceEditor: undefined as Editor | undefined,

    frame: undefined as HTMLIFrameElement | undefined,
    renderedDocument: null as Document | null,
    sourceMap: [] as emmm.HTMLSourceMapEntry[],

    colors: Memorized.$('colorParams', ZArticleColors, {
        theme: Color.getColor('white'),
        text: Color.getColor('black'),
        commentary: Color.getColor('indianred'),
        link: Color.getColor('MediumVioletRed'),
        highlight: Color.getColor('yellow')
    }),

    backgroundImage: Memorized.$('backgroundImage', z.string(), ''),

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
        if (!elem) return;

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

        const result = await renderDocument(pd, {
            sass: this.stylesheet.get(),
            colors: this.colors.get(),
            backgroundImage: this.backgroundImage.get(),
        });

        if (result.type !== 'ok') {
            return;
        }

        this.renderedDocument = result.doc
        this.sourceMap = result.map;

        const sx = this.frame.contentWindow!.scrollX;
        const sy = this.frame.contentWindow!.scrollY;
        this.frame.srcdoc = this.renderedDocument.documentElement.outerHTML;
        this.frame.addEventListener(
            'load', () => {
                this.frame!.contentWindow!.scrollTo(sx, sy);
                this.onFrameLoaded.dispatch();
            }, { once: true });

        const doc = this.frame.contentDocument!;
        doc.addEventListener('selectionchange', () => {
            const sel = doc.getSelection()!;
            const n = sel.anchorNode;
            const id = getId(n);
            if (id === undefined) return;
            const entry = this.sourceMap.find((x) => x.id == id);
            if (!entry) return;
            this.sourceEditor?.setSelections([{ from: entry.start, to: entry.end }]);
        });
    }
});
