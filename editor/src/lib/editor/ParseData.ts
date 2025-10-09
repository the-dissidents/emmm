import { CustomConfig } from "$lib/custom/Custom";
import { Facet, StateField } from "@codemirror/state";
import * as emmm from "@the_dissidents/libemmm";

export type EmmmParseData = {
    data: emmm.Document,
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
        const start = performance.now();
        const context = state.facet(emmmContextProvider)() 
            ?? new emmm.ParseContext(emmm.Configuration.from(CustomConfig));
        const scanner = new emmm.SimpleScanner(state.doc.toString(), state.facet(emmmSourceDescriptorProvider));
        const result = context.parse(scanner);

        return {
            data: result,
            parseTime: performance.now() - start
        };
    },
    update(value, transaction) {
        if (!transaction.docChanged) return value;
        return this.create(transaction.state);
    },
})