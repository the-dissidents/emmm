<script lang="ts">
  import { onMount } from "svelte";
  import { EditorView } from "@codemirror/view";
  import { createEditorState, emmmConfiguration, emmmDocument } from "./EditorTheme";
  import { EditorState } from "@codemirror/state";
  import * as emmm from '@the_dissidents/libemmm';

  import testString from './testsource.txt?raw';

  interface Props {
    onchange?(text: string): void;
    onparse?(doc: emmm.Document): void;
  }

  let { onchange = undefined, onparse = undefined }: Props = $props();

  let editorContainer: HTMLDivElement;
  let view: EditorView;
  let state: EditorState;

  let config = emmm.Configuration.from(emmm.DefaultConfiguration);

  const exts = [
    EditorView.updateListener.of((update) => {
      const prev = update.startState.field(emmmDocument);
      const doc = update.state.field(emmmDocument);
      if (/*prev !== doc &&*/ doc && onparse)
        onparse(doc.data);

      if (update.docChanged && onchange)
        onchange(update.view.state.doc.toString());
    }),
    emmmConfiguration.of(config)
  ];

  onMount(() => {
    state = createEditorState(testString, exts);
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
