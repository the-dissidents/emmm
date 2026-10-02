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

  const themeChangeEffect = StateEffect.define<'dark' | 'light'>();

  const isDarkThemeObserver = StateField.define<boolean>({
    create() {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    },
    update(value, transaction: Transaction){
      const effect = transaction.effects.find((x) => x.is(themeChangeEffect));
      if (effect)
        return effect.value == 'dark';
      return value;
    }
  });
</script>

<script lang="ts">
  import { getContext, onMount, setContext } from "svelte";
  import { drawSelection, dropCursor, EditorView, highlightActiveLine, highlightSpecialChars, highlightWhitespace, keymap, lineNumbers } from "@codemirror/view";
  import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
  import { EditorSelection, EditorState, StateEffect, StateField, Transaction, type Extension, type TransactionSpec } from "@codemirror/state";
  import { hook } from "$lib/details/Hook.svelte";
  import { emmmForceReparseEffect } from "./ParseData";
  import { forEachDiagnostic, type Diagnostic } from "@codemirror/lint";

  interface Props {
    /**
     * Fires when the text is edited. Changing `text` by code will not trigger this event.
     */
    onChange?(text: string): void;
    onScroll?(e: Event, view: EditorView): void;
    onCursorPositionChanged?(pos: number, l: number, c: number): void;
    onFocus?(): void;
    onBlur?(): void;
    /**
     * Changing this will reset cursor positions etc.
     */
    text?: string,

    banner?: string,
  }

  export type Selection = {
    from: number, to: number
  };

  let {
    onChange: onTextChange, onCursorPositionChanged, onFocus, onBlur, onScroll,
    text = $bindable(''), banner
  }: Props = $props();

  let editorContainer: HTMLDivElement;
  let view: EditorView;

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
        text = update.view.state.doc.toString();
        onTextChange?.(text);
      }
    }),
    EditorView.domEventHandlers({
      "scroll"(event, view) {
        onScroll?.(event, view);
      },
    })
  ];

  export function diagnostics() {
    const result: Diagnostic[] = [];
    forEachDiagnostic(view.state, (d) => result.push(d));
    return result;
  }

  export function focus() {
    view.focus();
  }

  export function resolvePosition(pos: number): [number, number] {
    const line = view.state.doc.lineAt(pos);
    return [line.number, pos - line.from];
  }

  export function getCursorPosition(): [number, number, number] {
    const pos = view.state.selection.main.head;
    const line = view.state.doc.lineAt(pos);
    return [pos, line.number, pos - line.from];
  }

  export function getText() {
    return text;
  }

  export function getSelections() {
    return view.state.selection.ranges.map((x) => ({ from: x.from, to: x.to }));
  }

  export function setSelections(s: Selection[]) {
    view.dispatch({
      selection: s.length > 0
        ? EditorSelection.create(s.map((x) => EditorSelection.range(x.from, x.to)))
        : EditorSelection.cursor(view.state.selection.main.head),
      scrollIntoView: true,
    });
  }

  export function update(spec: TransactionSpec) {
    view.dispatch(spec);
  }

  export function reparse() {
    view.dispatch({
      effects: emmmForceReparseEffect.of(null)
    });
  }

  onMount(() => {
    const context = getEditorContext();
    view = new EditorView({
      parent: editorContainer,
      state: EditorState.create({
        doc: text,
        extensions: [
          isDarkThemeObserver.extension,
          EditorView.darkTheme.from(isDarkThemeObserver),
          lineNumbers(),
          highlightSpecialChars(),
          history(),
          drawSelection(),
          dropCursor(),
          highlightWhitespace(),
          highlightActiveLine(),
          EditorView.lineWrapping,
          EditorState.tabSize.of(4),
          EditorState.allowMultipleSelections.of(true),
          keymap.of([...defaultKeymap, indentWithTab, ...historyKeymap]),
          context?.extensions ?? [],
          exts
        ],
      })
    });

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', event => {
        const newColorScheme = event.matches ? "dark" : "light";
        view.dispatch({
          effects: [ themeChangeEffect.of(newColorScheme) ]
        });
    });
    hook(() => text, (x) => {
      const value = view.state.doc.toString();
      if (value == x) return;

      view.dispatch({changes: [{
        from: 0, to: view.state.doc.length,
        insert: x
      }]});
    });
  });
</script>

<div bind:this={editorContainer} class="outer">
  {#if banner}
    <div class="banner">{banner}</div>
  {/if}
</div>

<style lang='scss'>
  @use '../../uchu';

  .outer {
    display: flex;
    flex-direction: column;

    justify-content: center;
    overflow: auto;
    height: 100%;
    border-radius: 0 0 3px 3px;
    box-sizing: border-box;

    position: relative;

    .banner {
      font-size: 85%;
      padding: 1px 6px;
      background-color: uchu.$pink-2;
      color: uchu.$red-9;
    }

    :global(.cm-editor) {
      flex-grow: 1;
      overflow-y: scroll;
    }

    @media (prefers-color-scheme: light) {
      border: 1px solid #f0a299;
    }

    @media (prefers-color-scheme: dark) {
      border: 1px solid #8d6262;
    }
  }
</style>
