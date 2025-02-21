<script lang="ts">
  import { onMount } from "svelte";
  import { EditorView } from "@codemirror/view";
  import { createEditorState, emmmConfiguration, emmmDocument } from "./EditorTheme";
  import { EditorState } from "@codemirror/state";
  import * as emmm from '@the_dissidents/libemmm';

  interface Props {
    onchange?(text: string): void;
    onparse?(doc: emmm.Document): void;
  }

  let { onchange = undefined, onparse = undefined }: Props = $props();

  let editorContainer: HTMLDivElement;
  let view: EditorView;
  let state: EditorState;

  let config = new emmm.Configuration(emmm.DefaultConfiguration);

  const exts = [
    EditorView.updateListener.of((update) => {
      const prev = update.startState.field(emmmDocument);
      const doc = update.state.field(emmmDocument);
      if (prev !== doc && doc && onparse)
        onparse(doc.data);

      if (update.docChanged && onchange)
        onchange(update.view.state.doc.toString());
    }),
    emmmConfiguration.of(config)
  ];

  onMount(() => {
    let text = `[-define-block wrapper:var:name]
[-define-block $(name):value]
[-var $(var):$(value)]

[.wrapper COLOR:color;]

[.color 123;]`;
    state = createEditorState(text, exts);
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
