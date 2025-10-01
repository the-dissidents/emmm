<script lang="ts">
  import { EditorView } from "@codemirror/view";
  import { setEditorContext } from "./Editor.svelte";
  import type { Snippet } from "svelte";
  import { emmmDocument, type ContextProvider, type DescriptorProvider, type EmmmParseData } from "./editor/ParseData";
  import { emmmLanguageSupport } from "./editor/LanguageSupport";

  interface Props {
    provideContext?: ContextProvider;
    provideDescriptor?: DescriptorProvider;
    onParse?(data: EmmmParseData, src: string): void;
    children: Snippet;
  }

  let { provideContext, provideDescriptor, onParse, children }: Props = $props();

  setEditorContext({
    extensions: [
      emmmLanguageSupport(provideContext, provideDescriptor),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          const doc = update.state.field(emmmDocument);
          if (doc) onParse?.(doc, update.view.state.doc.toString());
        }
      })
    ]
  });
</script>

{@render children()}