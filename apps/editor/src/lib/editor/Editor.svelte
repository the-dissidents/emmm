<script lang='ts' module>
  interface EditorContext {
    extensions: Extension,
  }

  const key = Symbol('EditorContext');
  export function setEditorContext(ctx: EditorContext) {
    setContext(key, ctx);
  }
  function getEditorContext(): EditorContext | undefined {
    return getContext(key);
  }
</script>

<script lang="ts">
  import { getContext, onMount, setContext } from "svelte";
  import { drawSelection, dropCursor, EditorView, highlightActiveLine, highlightSpecialChars, highlightWhitespace, keymap, lineNumbers } from "@codemirror/view";
  import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
  import { EditorSelection, EditorState, type Extension, type TransactionSpec } from "@codemirror/state";
  import { closeBrackets } from "@codemirror/autocomplete";
  import { hook } from "$lib/details/Hook.svelte";

  interface Props {
    /**
     * Fires when the text is edited. Changing `text` by code will not trigger this event.
     */
    onChange?(text: string): void;
    onCursorPositionChanged?(pos: number, l: number, c: number): void;
    onFocus?(): void;
    onBlur?(): void;
    /**
     * Changing this will reset cursor positions etc.
     */
    text?: string,
    hout?: EditorHandleOut
  }

  export type Selection = {
    from: number, to: number
  };

  export interface EditorHandleOut {
    focus(): void;
    getCursorPosition(): [pos: number, l: number, c: number];
    getText(): string;
    getSelections(): Selection[];
    setSelections(s: Selection[]): void;
    update(c: TransactionSpec): void;
  }

  let {
    onChange: onTextChange, onCursorPositionChanged, onFocus, onBlur,
    text = $bindable(''),
    hout = $bindable(),
  }: Props = $props();

  let editorContainer: HTMLDivElement;
  let view: EditorView;
  let shouldChange = true;

  const exts = [
    EditorView.updateListener.of((update) => {
      if (update.startState.selection.main.head != update.state.selection.main.head
       && onCursorPositionChanged)
      {
        const pos = update.state.selection.main.head;
        const line = update.state.doc.lineAt(pos);
        onCursorPositionChanged(pos, line.number, pos - line.from);
      }
      if (update.focusChanged) {
        update.view.hasFocus ? onFocus?.() : onBlur?.();
      }
      if (update.docChanged) {
        shouldChange = false;
        text = update.view.state.doc.toString();
        onTextChange?.(text);
      }
    }),
  ];

  onMount(() => {
    const context = getEditorContext();
    console.log(context);
    view = new EditorView({
      parent: editorContainer,
      state: EditorState.create({
        doc: text,
        extensions: [
            lineNumbers(),
            highlightSpecialChars(),
            // highlightActiveLineGutter(),
            history(),
            drawSelection(),
            dropCursor(),
            closeBrackets(),
            highlightWhitespace(),
            highlightActiveLine(),
            // highlightSelectionMatches(),
            EditorView.lineWrapping,
            EditorState.tabSize.of(4),
            EditorState.allowMultipleSelections.of(true),
            keymap.of([...defaultKeymap, indentWithTab, ...historyKeymap]),
            context?.extensions ?? [],
            exts
        ],
      })
    });
    hout = {
      focus() {
          view.focus();
      },
      getCursorPosition() {
        const pos = view.state.selection.main.head;
        const line = view.state.doc.lineAt(pos);
        return [pos, line.number, pos - line.from];
      },
      getText() {
        return text;
      },
      getSelections() {
        return view.state.selection.ranges.map((x) => ({ from: x.from, to: x.to }));
      },
      setSelections(s) {
        view.dispatch({
          selection: EditorSelection.create(
            s.map((x) => EditorSelection.range(x.from, x.to)))
        });
      },
      update(spec) {
        view.dispatch(spec);
      }
    };
    hook(() => text, (x) => {
      if (!shouldChange) {
        shouldChange = true;
        return;
      }
      view.dispatch({changes: [{
        from: 0, to: view.state.doc.length,
        insert: x
      }]});
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
    border: 1px solid whitesmoke;
    border-radius: 3px;
    box-sizing: border-box;
  }
</style>
