import { emmmAutocompletion } from "./Autocompletion";
import { emmmLinter } from "./Linter";
import { emmmContextProvider, emmmDocument, emmmSourceDescriptorProvider, type ContextProvider, type DescriptorProvider } from "./ParseData";
import { emmmTheme } from "./Theme";
import { emmmWrapIndent } from "./WrapIndent";
import { emmmGutter } from "./Gutter";
import { emmmHighlighter } from "./Highlighter";
import { emmmStructureExt } from "./Structure";

export function emmmLanguageSupport(
    context?: ContextProvider,
    descriptor?: DescriptorProvider
) {
    return [
        emmmContextProvider.of(() => (context?.() ?? undefined)),
        emmmSourceDescriptorProvider.of(() => (descriptor?.() ?? undefined)),
        emmmDocument.extension,
        emmmStructureExt,
        emmmHighlighter,
        emmmWrapIndent,
        emmmGutter,
        emmmLinter,
        emmmAutocompletion,
        emmmTheme,
    ];
}