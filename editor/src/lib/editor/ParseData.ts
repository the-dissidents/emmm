import { CustomConfig } from "$lib/custom/Custom";
import { Facet, StateField } from "@codemirror/state";
import * as emmm from "@the_dissidents/libemmm";

export type EmmmParseData = {
    data: emmm.Document,
    source: string,
    parseTime: number
};

export type ContextProvider = () => (emmm.ParseContext | undefined);
export type DescriptorProvider = () => (emmm.SourceDescriptor | undefined);

export const emmmContextProvider = 
    Facet.define<ContextProvider, ContextProvider>({
        combine: (values) => values.at(-1) ?? (() => undefined),
    });

export const emmmSourceDescriptorProvider = 
    Facet.define<DescriptorProvider, emmm.SourceDescriptor>({
        combine: (values) => values.at(-1)?.() ?? { name: '<unnamed>' },
    });

export const emmmDocument = StateField.define<EmmmParseData | undefined>({
    create(state) {
        emmm.setDebugLevel(emmm.DebugLevel.Warning);
        const context = state.facet(emmmContextProvider)() 
            ?? new emmm.ParseContext(emmm.Configuration.from(CustomConfig));
        const start = performance.now();
        const text = state.doc.toString();
        const scanner = new emmm.SimpleScanner(text, state.facet(emmmSourceDescriptorProvider));
        const result = emmm.parse(scanner, context);

        return {
            data: result,
            source: text,
            parseTime: performance.now() - start
        };
    },
    update(value, transaction) {
        if (!transaction.docChanged) return value;
        return this.create(transaction.state);
    },
})