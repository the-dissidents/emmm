<script lang="ts">
  import { EditorView } from "@codemirror/view";
  import { setEditorContext } from "./Editor.svelte";
  import type { Snippet } from "svelte";
  import { emmmDocument, type ContextProvider, type DescriptorProvider, type EmmmParseData } from "./ParseData";
  import { emmmLanguageSupport } from "./LanguageSupport";

  interface Props {
    provideContext?: ContextProvider;
    provideDescriptor?: DescriptorProvider;
    onParse?(data: EmmmParseData, src: string): void;
    children: Snippet;
  }

  let { provideContext, provideDescriptor, onParse, children }: Props = $props();

  let oldDoc: EmmmParseData | undefined = undefined;

  setEditorContext({
    extensions: [
      emmmLanguageSupport(provideContext, provideDescriptor),
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
