import { CustomConfig } from "$lib/features/article";
import { Facet, StateField } from "@codemirror/state";
import * as emmm from "@the_dissidents/libemmm";

export type EmmmInspectorData = {
    readonly position: number,
    readonly config: emmm.ReadonlyConfiguration,
    readonly variables: ReadonlyMap<string, string>
};

export type EmmmParseData = {
    data: emmm.Document,
    inspector: EmmmInspectorData | null,
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

        let inspector: EmmmInspectorData | null = null;
        const scanner = new emmm.SimpleScanner(
            state.doc.toString(),
            state.facet(emmmSourceDescriptorProvider),
            [{
                position: state.selection.main.head,
                callback(cxt, position) {
                    inspector = {
                        position,
                        config: emmm.Configuration.from(cxt.config),
                        variables: new Map(cxt.variables)
                    };
                },
            }]);
        const result = context.parse(scanner);

        return {
            data: result,
            parseTime: performance.now() - start,
            inspector
        };
    },
    update(value, transaction) {
        if (!transaction.docChanged) return value;
        return this.create(transaction.state);
    },
})
