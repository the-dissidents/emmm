<script lang="ts">
  import { onMount } from "svelte";
  import { EditorView } from "@codemirror/view";
  import { createEditorState, emmmContextProvider, emmmDocument, emmmSourceDescriptorProvider, type ContextProvider, type EmmmParseData } from "./EditorTheme";
  import { EditorState } from "@codemirror/state";
  import * as emmm from '@the_dissidents/libemmm';

  interface Props {
    onchange?(text: string): void;
    onparse?(data: EmmmParseData, src: string): void;
    getContext?: ContextProvider;
    descriptor?: emmm.SourceDescriptor,
    initialText?: string;
  }

  let { 
    onchange = undefined, 
    onparse = undefined, 
    getContext = () => undefined,
    descriptor = { name: '<unnamed>' },
    initialText = "",
  }: Props = $props();

  let editorContainer: HTMLDivElement;
  let view: EditorView;
  let state: EditorState;

  const exts = [
    EditorView.updateListener.of((update) => {
      const prev = update.startState.field(emmmDocument);
      const doc = update.state.field(emmmDocument);
      if (/*prev !== doc &&*/ doc && onparse)
        onparse(doc, update.view.state.doc.toString());

      if (update.docChanged && onchange)
        onchange(update.view.state.doc.toString());
    }),
    emmmContextProvider.of(getContext),
    emmmSourceDescriptorProvider.of(descriptor)
  ];

  onMount(() => {
    state = createEditorState(initialText, exts);
    view = new EditorView({
      parent: editorContainer,
      state,
    });
  });
</script>

<div bind:this={editorContainer} class="outer">
</div>

<style>
  .outer {
    display: flex;
    justify-content: center;
    overflow: auto;
    height: 100%;
  }
</style>
