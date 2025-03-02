<script lang="ts">
  import TestPane from './TestPane.svelte';

  import * as emmm from '@the_dissidents/libemmm';

  import Editor, { type EditorHandleOut } from './Editor.svelte';
  import Resizer from './ui/Resizer.svelte';
  import TabView from './ui/TabView.svelte';
  import TabPage from './ui/TabPage.svelte';

  import testString from './testsource.txt?raw';
  import testLib from './testlib.txt?raw';
  import testStyles from './typesetting.css?raw';
  import type { EmmmParseData } from './EditorTheme';
  import { postprocessWeChat } from './Postprocessors';
  import Colorpicker from './ui/Colorpicker.svelte';
  import Color from 'colorjs.io';
  import { deriveColorsFrom, getCssVariablesFromColors, type ArticleColors } from './ColorTheme';
  import ListView, { type ListColumn, type ListItem, type ListViewHandleIn, type ListViewHandleOut } from './ui/ListView.svelte';
  import { SvelteMap } from 'svelte/reactivity';

  let outputAST = $state('');
  let emmmdoc: emmm.Document | undefined;
  let renderedHTML = $state('');
  let left = $state<HTMLElement>(), 
      middle = $state<HTMLElement>(), 
      right = $state<HTMLElement>(),
      bottom = $state<HTMLElement>(),
      frame = $state<HTMLIFrameElement>();

  let strip = $state(false);
  let status = $state('ok');
  let parsedStatus = $state('');
  let posStatus = $state('line ?, col ?');
  let sourceHandle = $state<EditorHandleOut>({}),
      libraryHandle = $state<EditorHandleOut>({});

  let config: emmm.Configuration;
  {
    emmm.setDebugLevel(emmm.DebugLevel.Warning);
    let lib = emmm.parse(
      new emmm.SimpleScanner(testLib), 
      new emmm.ParseContext(
        emmm.Configuration.from(emmm.DefaultConfiguration)));
    config = lib.context.config;
  }

  function onParseLibrary(doc: EmmmParseData) {
    config = doc.data.context.config;
  }

  function getContext() {
    return new emmm.ParseContext(emmm.Configuration.from(config));
  }

  function onCursorPositionChanged(_: number, l: number, c: number) {
    posStatus = `line ${l}, col ${c}`;
  }

  function updateCursorPosition(h?: EditorHandleOut) {
    if (!h?.getCursorPosition) return;
    onCursorPositionChanged(...h.getCursorPosition());
  }

  function onParse(doc: EmmmParseData, source: string) {
    parsedStatus = `parsed in ${doc.time.toFixed(0)}ms`;
    emmmdoc = strip ? doc.data.toStripped() : doc.data;
    outputAST = emmm.debugPrint.document(emmmdoc, source);
    updateProblemList();
    render();
  }

  const problemListHeader = new SvelteMap<string, ListColumn>([
    ['file', {name: 'file', type: 'text', vAlign: 'top', short: true}],
    ['type', {name: 'T', type: 'text', vAlign: 'top', short: true}],
    ['code', {name: '#', type: 'text', vAlign: 'top', short: true}],
    ['line', {name: 'line', type: 'text', vAlign: 'top', short: true}],
    ['col', {name: 'column', type: 'text', vAlign: 'top', short: true}],
    ['msg', {name: 'message', type: 'text'}]
  ]);
  let problemListHandleOut: ListViewHandleOut | undefined = $state();
  function updateProblemList() {
    problemListHandleOut?.reset(emmmdoc!.messages.map((x) => ({
      cols: {
        file: {type: 'text', content: x.location.source.name},
        type: {type: 'text', content: {
          [emmm.MessageSeverity.Warning]: '⚠️',
          [emmm.MessageSeverity.Error]: '❌',
          [emmm.MessageSeverity.Info]: 'ℹ️'
        }[x.severity]},
        code: {type: 'text', content: `${x.code}`},
        line: {type: 'text', content: `${x.location.start}`},
        col: {type: 'text', content: `${x.location.end}`},
        msg: {type: 'text', content: x.info},
      }
    })));
  }

  function render() {
    if (!emmmdoc) return;
    let renderConfig = emmm.HTMLRenderConfiguration;
    let state = new emmm.HTMLRenderState();
    state.cssVariables = new Map([
      ['theme-color', 'rgb(182, 218, 224)'],
      ['text-color', 'rgb(0, 50, 58)'],
      ['link-color', 'rgb(44, 127, 200)'],
      ['note-color', 'rgb(44, 127, 141)'],
      ['commentary-color', 'rgb(44, 127, 141)'],
      ['separator-color', 'rgb(44, 127, 141)'],
    ]);
    state.cssVariables = getCssVariablesFromColors(colors, 'srgb');
    state.stylesheet = testStyles;
    renderedHTML = renderConfig.render(emmmdoc, state);
  }

  async function copyHTML() {
    if (!frame) {
      status = 'error: no frame?';
      return;
    }
    try {
      const processed = postprocessWeChat(frame!);
      console.log(processed);
      await navigator.clipboard.write([new ClipboardItem({'text/html': processed})]);
      // await clipboard.writeHtml(renderedHTML);
      status = 'copied';
    } catch (e) {
      status = `error: ${e}`;
    }
  }

  let colors: ArticleColors = $state({
    theme: new Color('pink'),
    text: new Color('black'),
    commentary: new Color('black'),
    link: new Color('black'),
    highlight: new Color('yellow')
  });
  let autoColor = $state(true);

  function doDeriveColors() {
    colors = deriveColorsFrom(colors.theme);
    render();
  }

  doDeriveColors();
</script>

<div class="vlayout fill">

<!-- main area -->
<div class="hlayout flexgrow">

<!-- tools view -->
<div class="pane" style="width: 250px;" bind:this={left}>
  <TabView>
    <TabPage name='Test'>
      <TestPane></TestPane>
    </TabPage>
    <TabPage name="Options">
      <h5>Theme color</h5>
      <Colorpicker bind:color={colors.theme} mode='hsl'
        onChange={doDeriveColors} />
      <hr/>
      <label><input type="checkbox"
          bind:checked={autoColor} onchange={() => {
            if (!autoColor) return;
            colors = deriveColorsFrom(colors.theme);
            render();
          }}/>
        automatically derive the rest
      </label>
      <h5>Text color</h5>
      <Colorpicker bind:color={colors.text} mode='hsl'
        onChange={doDeriveColors} />
      <h5>Commentary color</h5>
      <Colorpicker bind:color={colors.commentary} mode='hsl'
        onChange={doDeriveColors} />
      <h5>Link color</h5>
      <Colorpicker bind:color={colors.link} mode='hsl'
        onChange={doDeriveColors} />
      <h5>Highlight color</h5>
      <Colorpicker bind:color={colors.highlight} mode='hsl'
        onChange={doDeriveColors} />
    </TabPage>
  </TabView>
</div>

<Resizer first={left} second={middle} vertical={true} />

<!-- source view -->
<div class="pane flexgrow" bind:this={middle}>
  <TabView>
    <TabPage name="Source" 
      onActivate={() => sourceHandle?.focus?.()}>
      <Editor hin={{
          onFocus: () => updateCursorPosition(sourceHandle),
          onCursorPositionChanged,
          onParse, 
          provideDescriptor: () => ({name: '<Source>'}),
          provideContext: getContext
        }} bind:hout={sourceHandle}
        initialText={testString}/>
    </TabPage>
    <TabPage name="Library"
      onActivate={() => libraryHandle?.focus?.()}>
      <Editor hin={{
          onFocus: () => updateCursorPosition(libraryHandle),
          onCursorPositionChanged,
          onParse: onParseLibrary,
          provideDescriptor: () => ({name: '<Library>'})
        }} bind:hout={libraryHandle}
        initialText={testLib} />
    </TabPage>
  </TabView>
</div>

<Resizer first={right} second={middle} vertical={true} reverse={true} />

<!-- preview -->
<div class="pane" bind:this={right} style="width: 500px;">
  <TabView>
    <TabPage name="Preview" active={true}>
      <iframe bind:this={frame} title="preview" srcdoc={renderedHTML} sandbox="allow-same-origin">
      </iframe>
    </TabPage>
    <TabPage name="AST">
      <div class="vlayout fill">
        <textarea class="flexgrow">{outputAST}</textarea>
        <label>
          <input type="checkbox" bind:checked={strip} />
          only show transformed (stripped) AST
        </label>
      </div>
    </TabPage>
    <TabPage name="HTML">
      <textarea class="fill">{renderedHTML}</textarea>
    </TabPage>
  </TabView>
</div>
</div>

<Resizer first={bottom} reverse={true} />

<div class="pane" style="height: 100px" bind:this={bottom}>
  <ListView header={problemListHeader} bind:hout={problemListHandleOut}/>
</div>

<div class="pane">
  <div class='hlayout status'>
    <span class='flexgrow'>
      {status}
    </span>
    <hr/>
    <span>
      {posStatus}
    </span>
    <hr/>
    <button onclick={copyHTML}>
      copy rendered result
    </button>
    <hr/>
    <span>
      {parsedStatus}
    </span>
  </div>
</div>

</div>


<style>
  label {
    font-size: 85%;
  }

  .pane {
    padding: 2px;
    box-sizing: border-box;
  }

  textarea {
    width: 100%;
    resize: none;
    overflow: visible;
    border-radius: 2px;
    border: 1px solid gray;
    padding: 5px;
    box-sizing: border-box;
  }

  iframe {
    border: 1px solid whitesmoke;
    border-radius: 3px;
    box-sizing: border-box;
    position: sticky;
    width: 100%;
    height: 100%;
  }

  .status {
    font-size: 85%;
    border: 1px solid pink;
    border-radius: 3px;
    background-color: lightpink;
    padding: 0 10px;
  }

  .status span {
    display: inline-block;
    padding: 0 5px;
  }

  .status button {
    appearance: none;
    font-size: 13.6px;
    display: inline-block;
    background-color: transparent;
    border: none;
    border-radius: 0;
    box-shadow: none;
    margin: 0;
    padding: 0 5px;

    &:hover {
      background-color: color-mix(in lab, lightpink, pink 30%);
    }
  }

  .status hr {
    width: 0;
    border-left: 1px solid white;
    border-right: none;
    border-top: none;
    border-bottom: none;
    margin: 0 5px;
  }
</style>
