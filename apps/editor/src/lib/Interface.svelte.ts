import { writable } from "svelte/store"
import { ZArticleColors } from "./ColorTheme";
import * as Color from "colorjs.io/fn";

import * as emmm from '@the_dissidents/libemmm';
import { Memorized } from "./config/Memorized.svelte";

import * as z from "zod/v4-mini";

import { defaultStyles, defaultLibrary } from './Templates';

import { Debug } from "./Debug";
import { renderDocument } from "./Document.svelte";
import { Workspace } from "./workspace/Workspace.svelte";
import { EventHost } from "@the_dissidents/svelte-ui";
import { processDocument, type Options } from "@the_dissidents/mojikit";

let status = writable<string>('ok');
let progress = writable<number | undefined>();

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

const mojikitOpts: Options = {
    rulesets: [
        {
            heuristic: /[\u3000-\u303f\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef\u{20000}-\u{2fa1f}\u{30000}-\u{3134a}“”‘’—·⸺⋯…\d\.\[\]]/u,
            tagName: "mjk-chs",
            squeezeLeft: /[“‘《〈（「『]/,
            squeezeRight: /[”’〉》）」』，。、：；？！]/,
            squeezeMiddle: /·/,
            noBreakBefore: /[”’〉》）」』，。、：；？！—·⸺⋯－]/,
            noBreakAfter: /[“‘《〈（「『—·⸺⋯－]/,
            addClass: /[—·⸺⋯－…]/,
            weight: 4,
        }, {
            heuristic: /[\u0021-\u007e\u00a1-\u00ff\p{Script=Latin}“”‘’ ]/u,
            tagName: "mjk-lat",
            // addClass: /[“”‘’]/, // only problematic ones
            weight: 2,
        }
    ],
    classnames: {
        ambiguous: 'ambig',
        squeezeLeft: 'sql',
        squeezeRight: 'sqr',
        squeezeMiddle: 'sqm',
        quarter: 'q',
    },
    halfDetectionWindow: 10,
    weightDecay: 0.5,
};

export const Interface = $state({
    get status() { return status; },
    get progress() { return progress; },

    stylesheet: Memorized.$('stylesheet', z.string(), defaultStyles),
    library: Memorized.$('library', z.string(), defaultLibrary),

    invertedPreview: Memorized.$('invertedPreview', z.boolean(), false),
    syncScrolling: Memorized.$('syncScrolling', z.boolean(), false),

    libConfig: undefined as emmm.Configuration | undefined,

    frame: undefined as HTMLIFrameElement | undefined,
    renderedHTML: null as string | null,
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

        const lx = pos;
        const l1 = mostSpecific.start;
        const l2 = mostSpecific.end;

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
        const pd = Workspace.active?.parseData?.data;
        if (!pd || !this.frame) return;
        const editor = Workspace.active?.editor;
        const result = await renderDocument(pd, {
            sass: this.stylesheet.get(),
            colors: this.colors.get(),
            backgroundImage: this.backgroundImage.get(),
        });
        if (result.type !== 'ok') return;

        processDocument(result.doc, mojikitOpts);
        this.renderedHTML = result.doc.documentElement.outerHTML;
        this.sourceMap = result.map;

        const sx = this.frame.contentWindow!.scrollX;
        const sy = this.frame.contentWindow!.scrollY;
        this.frame.srcdoc = this.renderedHTML;
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
            editor?.setSelections([{ from: entry.start, to: entry.end }]);
        });
    }
});
