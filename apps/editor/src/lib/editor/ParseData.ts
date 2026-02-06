import { CustomConfig } from "$lib/emmm/Custom";
import { Facet, StateEffect, StateField } from "@codemirror/state";
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

export const emmmForceReparseEffect = StateEffect.define();

export const emmmDocument = StateField.define<EmmmParseData | undefined>({
    create(state) {
        emmm.setDebugLevel(emmm.DebugLevel.Warning);
        const start = performance.now();
        const context = state.facet(emmmContextProvider)()
            ?? new emmm.ParseContext(emmm.Configuration.from(CustomConfig, false));

        let inspector: EmmmInspectorData | null = null;
        const scanner = new emmm.SimpleScanner(
            state.doc.toString(),
            state.facet(emmmSourceDescriptorProvider),
            [{
                position: state.selection.main.head,
                callback(cxt, position) {
                    inspector = {
                        position,
                        config: emmm.Configuration.from(cxt.config, false),
                        variables: new Map(cxt.variables)
                    };
                },
            }]);
        const result = context.parse(scanner);
        const parseTime = performance.now() - start;

        return {
            data: result,
            parseTime, inspector
        };
    },
    update(value, transaction) {
        if (!transaction.docChanged
         && !transaction.effects.find((x) => x.is(emmmForceReparseEffect))) return value;

        return this.create(transaction.state);
    },
})
