import { emmmAutocompletion } from "./Autocompletion";
import { emmmLinter, type EmmmDiagnostic } from "./Linter";
import { emmmContextProvider, emmmDocument, emmmSourceDescriptorProvider, type ContextProvider, type DescriptorProvider } from "./ParseData";
import { emmmTheme } from "./Theme";
import { emmmWrapIndent } from "./WrapIndent";
import { emmmGutter } from "./Gutter";
import { emmmHighlighter } from "./Highlighter";
import { emmmStructureExt } from "./Structure";
import { emmmDropImage } from "./DropImage";
import { lintGutter } from "@codemirror/lint";

export function emmmLanguageSupport(
    context?: ContextProvider,
    descriptor?: DescriptorProvider,
    onLint?: (d: EmmmDiagnostic[]) => void,
) {
    return [
        emmmContextProvider.of(() => (context?.() ?? undefined)),
        emmmSourceDescriptorProvider.of(() => (descriptor?.() ?? undefined)),
        emmmDocument.extension,
        emmmAutocompletion,
        emmmStructureExt,
        emmmHighlighter,
        emmmWrapIndent,
        emmmLinter(onLint),
        lintGutter(),
        emmmGutter,
        emmmTheme,
        emmmDropImage,
    ];
}
