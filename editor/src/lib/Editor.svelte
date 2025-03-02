<script lang="ts">
  import { onMount } from "svelte";
  import { EditorView } from "@codemirror/view";
  import { createEditorState, emmmContextProvider, emmmDocument, emmmSourceDescriptorProvider, type ContextProvider, type DescriptorProvider, type EmmmParseData } from "./EditorTheme";
  import { EditorState } from "@codemirror/state";
  import * as emmm from '@the_dissidents/libemmm';

  interface Props {
    hin?: EditorHandleIn,
    hout?: EditorHandleOut,
    initialText?: string;
  }

  export interface EditorHandleIn {
    onTextChange?(text: string): void;
    onParse?(data: EmmmParseData, src: string): void;
    onCursorPositionChanged?(pos: number, l: number, c: number): void;
    onFocus?(): void;
    onBlur?(): void;
    onTextChange?(text: string): void;
    provideContext?: ContextProvider;
    provideDescriptor?: DescriptorProvider;
  }

  export interface EditorHandleOut {
    focus?(): void;
    setText?(text: string): void;
    getCursorPosition?(): [pos: number, l: number, c: number];
  }

  let {
    hin = {},
    hout = $bindable({}),
    initialText = "",
  }: Props = $props();

  let editorContainer: HTMLDivElement;
  let view: EditorView;

  const exts = [
    EditorView.updateListener.of((update) => {
      if (update.startState.selection.main.head != update.state.selection.main.head
       && hin.onCursorPositionChanged) 
      {
        const pos = update.state.selection.main.head;
        const line = update.state.doc.lineAt(pos);
        hin.onCursorPositionChanged(pos, line.number, pos - line.from);
      }
      if (update.focusChanged) {
        if (update.view.hasFocus) {
          hin.onFocus?.();
        } else {
          hin.onBlur?.();
        }
      }
      const prev = update.startState.field(emmmDocument);
      const doc = update.state.field(emmmDocument);
      if (/*prev !== doc &&*/ doc)
        hin.onParse?.(doc, update.view.state.doc.toString());

      if (update.docChanged)
        hin.onTextChange?.(update.view.state.doc.toString());
    }),
    emmmContextProvider.of(() => (hin.provideContext?.() ?? undefined)),
    emmmSourceDescriptorProvider.of(() => (hin.provideDescriptor?.() ?? undefined))
  ];

  onMount(() => {
    view = new EditorView({
      parent: editorContainer,
      state: createEditorState(initialText, exts),
    });
    hout = {
      setText(text) {
          // TODO: implement
      },
      focus() {
          view.focus();
      },
      getCursorPosition() {
        const pos = view.state.selection.main.head;
        const line = view.state.doc.lineAt(pos);
        return [pos, line.number, pos - line.from];
      },
    };
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
    border: 1px solid whitesmoke;
    border-radius: 3px;
    box-sizing: border-box;
  }
</style>
