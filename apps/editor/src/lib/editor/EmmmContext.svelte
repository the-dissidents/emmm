<script lang="ts">
  import { EditorView } from "@codemirror/view";
  import { setEditorContext } from "./Editor.svelte";
  import type { Snippet } from "svelte";
  import { emmmDocument, type ContextProvider, type DescriptorProvider, type EmmmParseData } from "./ParseData";
  import { emmmLanguageSupport } from "./LanguageSupport";
  import { type EmmmDiagnostic } from "./Linter";

  interface Props {
    provideContext?: ContextProvider;
    provideDescriptor?: DescriptorProvider;
    onParse?(data: EmmmParseData, src: string): void;
    onLint?(d: EmmmDiagnostic[]): void;
    children: Snippet;
  }

  let { provideContext, provideDescriptor, onParse, onLint, children }: Props = $props();

  let oldDoc: EmmmParseData | undefined = undefined;

  setEditorContext({
    extensions: [
      emmmLanguageSupport(provideContext, provideDescriptor, onLint),
      EditorView.updateListener.of((update) => {
        const doc = update.state.field(emmmDocument);
        if (doc !== oldDoc) {
          oldDoc = doc;
          if (doc) onParse?.(doc, update.view.state.doc.toString());
        }
      })
    ]
  });
</script>

{@render children()}
