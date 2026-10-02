import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { after, test } from 'node:test';
import { Window } from '../../../packages/libemmm/node_modules/happy-dom/lib/index.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve('vite'))('esbuild');
const window = new Window();
for (const key of ['window', 'document', 'navigator', 'Node', 'Text', 'HTMLElement',
  'MutationObserver', 'DOMRect', 'Range']) {
  Object.defineProperty(globalThis, key, {
    configurable: true, value: key === 'window' ? window : window[key],
  });
}
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
globalThis.getComputedStyle = window.getComputedStyle.bind(window);
const temp = await mkdtemp(join(tmpdir(), 'emmm-ime-'));
await build({
  stdin: {
    contents: `export { emmmHighlighter } from './src/lib/editor/Highlighter.ts';
      export { emmmDocument } from './src/lib/editor/ParseData.ts';
      export { EditorState } from '@codemirror/state';
      export { EditorView } from '@codemirror/view';
      export { history, undo, redo } from '@codemirror/commands';`,
    resolveDir: root, loader: 'ts',
  },
  bundle: true, format: 'esm', outfile: join(temp, 'editor.mjs'),
  tsconfigRaw: { compilerOptions: { target: 'ES2022' } },
  plugins: [{
    name: 'standalone-editor',
    setup(build) {
      // Isolate highlighting from the application's rendering and Tauri setup.
      // The parser, state field, decorations and editor view are all real.
      build.onResolve({ filter: /^\$lib\/emmm\/Custom$/ }, () => ({ path: 'config', namespace: 'test-config' }));
      build.onLoad({ filter: /.*/, namespace: 'test-config' }, () => ({
        contents: `export { BuiltinConfiguration as CustomConfig } from '@the_dissidents/libemmm';`,
        loader: 'js', resolveDir: root,
      }));
      build.onResolve({ filter: /^\$lib\// }, args => ({ path: join(root, 'src/lib', args.path.slice(5) + '.ts') }));
    },
  }],
});
const { EditorState, EditorView, emmmDocument, emmmHighlighter, history, undo, redo } =
  await import(pathToFileURL(join(temp, 'editor.mjs')));
after(async () => {
  await window.happyDOM.abort();
  await rm(temp, { recursive: true, force: true });
});

const original = '[-var shit=]\n\n[-var digest=一句话简介]\n\n[-var cover=网站封面图]\n';
const insertAt = original.indexOf(']');
function editor(t, doc = original) {
  const parent = document.createElement('div');
  document.body.append(parent);
  const view = new EditorView({ parent, state: EditorState.create({ doc,
    extensions: [emmmDocument, emmmHighlighter, history()],
  }) });
  t.after(() => { view.destroy(); parent.remove(); });
  return view;
}
function ranges(view) {
  const result = [];
  const text = view.state.doc.toString();
  view.plugin(emmmHighlighter).decorations.between(0, text.length, (from, to, value) => {
    if (value.spec.class) result.push({ from, to, class: value.spec.class, text: text.slice(from, to) });
  });
  return result;
}
function begin(view) {
  view.contentDOM.dispatchEvent(new window.CompositionEvent('compositionstart', { bubbles: true }));
  // State transactions stand in for the DOM mutations made by an OS input method.
  view.inputState.composing = 1;
}
function edit(view, changes) {
  view.dispatch({ changes, userEvent: 'input.type.compose' });
}
async function finish(view) {
  view.contentDOM.dispatchEvent(new window.CompositionEvent('compositionend', { bubbles: true }));
  await new Promise(resolve => setTimeout(resolve, 20));
}
function assertFresh(view) {
  const expected = new EditorView({ state: EditorState.create({ doc: view.state.doc,
    extensions: [emmmDocument, emmmHighlighter],
  }) });
  try { assert.deepEqual(ranges(view), ranges(expected)); }
  finally { expected.destroy(); }
}

test('maps trailing decorations while Chinese text is being composed', t => {
  const view = editor(t);
  const before = ranges(view).filter(x => x.from >= original.indexOf('[-var digest'));
  begin(view);
  edit(view, { from: insertAt, insert: '大便' });
  const after = ranges(view).filter(x => x.from >= original.indexOf('[-var digest') + 2);
  assert.deepEqual(after, before.map(x => ({ ...x, from: x.from + 2, to: x.to + 2 })));
  assert.equal(view.state.field(emmmDocument).data.context.variables.get('shit'), '大便');
  assert.equal(view.state.field(emmmDocument).data.messages.length, 0);
});

test('refreshes after compositionend without another text edit', async t => {
  const view = editor(t);
  begin(view);
  edit(view, { from: insertAt, insert: '大便' });
  const doc = view.state.doc;
  await finish(view);
  assert.equal(view.state.doc, doc);
  assertFresh(view);
  assert.ok(ranges(view).some(x => x.class.includes('em-args') && x.text === '大便'));
});

test('selection-only updates can catch up after a skipped refresh', t => {
  const view = editor(t);
  begin(view);
  edit(view, { from: insertAt, insert: '中文' });
  view.inputState.composing = -1;
  view.dispatch({ selection: { anchor: insertAt + 2 } });
  assertFresh(view);
});

test('handles repeated pinyin replacements, cancellation and deletion', async t => {
  const view = editor(t);
  begin(view);
  edit(view, { from: insertAt, insert: 'dabiann' });
  edit(view, { from: insertAt, to: insertAt + 7, insert: '大便' });
  edit(view, { from: insertAt + 1, to: insertAt + 2, insert: '' });
  await finish(view);
  assert.equal(view.state.field(emmmDocument).data.context.variables.get('shit'), '大');
  assertFresh(view);
  begin(view);
  edit(view, { from: insertAt, to: insertAt + 1, insert: '' });
  await finish(view);
  assert.equal(view.state.doc.toString(), original);
  assertFresh(view);
});

test('does not refresh in a new composition that starts before the previous timer', async t => {
  const view = editor(t);
  begin(view);
  edit(view, { from: insertAt, insert: '中' });
  view.contentDOM.dispatchEvent(new window.CompositionEvent('compositionend', { bubbles: true }));
  begin(view);
  edit(view, { from: insertAt + 1, insert: '文' });
  const decorations = view.plugin(emmmHighlighter).decorations;
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(view.plugin(emmmHighlighter).decorations, decorations);
  await finish(view);
  assertFresh(view);
});

test('accepts a final text transaction arriving after compositionend', async t => {
  const view = editor(t);
  begin(view);
  edit(view, { from: insertAt, insert: 'zhongwen' });
  view.contentDOM.dispatchEvent(new window.CompositionEvent('compositionend', { bubbles: true }));
  edit(view, { from: insertAt, to: insertAt + 8, insert: '中文' });
  await new Promise(resolve => setTimeout(resolve, 20));
  assertFresh(view);
});

test('ordinary typing, Chinese paste, surrogate pairs and undo/redo remain correct', t => {
  const view = editor(t);
  view.dispatch({ changes: { from: insertAt, insert: '𠮷😀é中文' }, userEvent: 'input.paste' });
  assert.equal(view.state.field(emmmDocument).data.context.variables.get('shit'), '𠮷😀é中文');
  assertFresh(view);
  assert.equal(undo(view), true);
  assert.equal(view.state.doc.toString(), original);
  assertFresh(view);
  assert.equal(redo(view), true);
  assertFresh(view);
});

test('destroy cancels a queued composition refresh', async t => {
  const view = editor(t);
  begin(view);
  edit(view, { from: insertAt, insert: '中文' });
  view.contentDOM.dispatchEvent(new window.CompositionEvent('compositionend', { bubbles: true }));
  view.destroy();
  let dispatches = 0;
  view.dispatch = () => { dispatches++; };
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(dispatches, 0);
});
