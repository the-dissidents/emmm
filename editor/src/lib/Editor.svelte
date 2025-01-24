<script lang="ts">
  import { onMount } from "svelte";
  import {
    drawSelection,
    EditorView,
    keymap,
    lineNumbers,
  } from "@codemirror/view";
  import { defaultKeymap, history } from "@codemirror/commands";
  import { DefaultTheme } from "./EditorTheme";
  import { EditorState, Compartment } from "@codemirror/state";

  interface Props {
    onchange?(text: string): void;
  }

  let { onchange = undefined }: Props = $props();

  let editorContainer: HTMLDivElement;
  let view: EditorView;
  let state: EditorState;

  const exts = [
    EditorView.updateListener.of((update) => {
      if (update.docChanged && onchange) {
        onchange(update.view.state.doc.toString());
      }
    })
  ];

  onMount(() => {
    let text = '';
    for (let i = 0; i < 100; i++)
      text += '1235 line 1235line1235 line 1235line1235 line 1235line1235 line 1235line1235 line 1235line1235 line 1235line1235 line 1235line1235 line 1235line1235 line 1235line\n\n';
    state = EditorState.create({
      doc: text,
      extensions: [
        keymap.of(defaultKeymap),
        history(),
        drawSelection(),
        lineNumbers(),
        DefaultTheme,
        EditorView.lineWrapping,
        EditorState.tabSize.of(4),
        exts
      ],
    });
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
