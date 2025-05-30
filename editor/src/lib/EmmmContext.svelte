<script lang="ts">
  import { EditorView } from "@codemirror/view";
  import { setEditorContext } from "./Editor.svelte";
  import { DefaultTheme, emmmContextProvider, emmmDocument, EmmmLanguageSupport, emmmSourceDescriptorProvider, WrapIndent, type ContextProvider, type DescriptorProvider, type EmmmParseData } from "./EditorTheme";
    import type { Snippet } from "svelte";

  interface Props {
    provideContext?: ContextProvider;
    provideDescriptor?: DescriptorProvider;
    onParse?(data: EmmmParseData, src: string): void;
    children: Snippet;
  }

  let { provideContext, provideDescriptor, onParse, children }: Props = $props();

  setEditorContext({
    extensions: [
      DefaultTheme,
      WrapIndent,
      EmmmLanguageSupport,
      emmmContextProvider.of(() => (provideContext?.() ?? undefined)),
      emmmSourceDescriptorProvider.of(() => (provideDescriptor?.() ?? undefined)),
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