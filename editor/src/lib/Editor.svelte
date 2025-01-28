<script lang="ts">
  import { onMount } from "svelte";
  import { EditorView } from "@codemirror/view";
  import { createEditorState, emmmConfiguration } from "./EditorTheme";
  import { EditorState } from "@codemirror/state";
  import * as emmm from '@the_dissidents/libemmm';

  interface Props {
    onchange?(text: string): void;
  }

  let { onchange = undefined }: Props = $props();

  let editorContainer: HTMLDivElement;
  let view: EditorView;
  let state: EditorState;

  let config = new emmm.Configuration(emmm.BuiltinConfiguration);
  config.blockModifiers.add(new emmm.BlockModifierDefinition(
    'pre', emmm.ModifierFlags.Preformatted));

  const exts = [
    EditorView.updateListener.of((update) => {
      if (update.docChanged && onchange) {
        onchange(update.view.state.doc.toString());
      }
    }),
    emmmConfiguration.of(config)
  ];

  onMount(() => {
    let text = '';
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
