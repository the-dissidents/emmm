<script lang="ts">
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

  let outputAST = $state('');
  let emmmdoc: emmm.Document | undefined;
  let renderedHTML = $state('');
  let left = $state<HTMLElement>(), 
      middle = $state<HTMLElement>(), 
      right = $state<HTMLElement>(),
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
    render();
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
    state.cssVariables = new Map([
      ['theme-color', themeColor.to('srgb').toString()],
      ['text-color', textColor.to('srgb').toString()],
      ['link-color', linkColor.to('srgb').toString()],
      ['note-color', commentaryColor.to('srgb').toString()],
      ['commentary-color', commentaryColor.to('srgb').toString()],
      ['separator-color', commentaryColor.to('srgb').toString()],
      ['highlight-color', highlightColor.to('srgb').toString()],
    ]);
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

  let themeColor = $state(new Color('pink'));
  let textColor = $state(new Color('black'));
  let commentaryColor = $state(new Color('black'));
  let linkColor = $state(new Color('black'));
  let highlightColor = $state(new Color('yellow'));
  let autoColor = $state(true);

  function deriveColors() {
    if (!autoColor) return;

    function f(x: number, a: number, b: number) {
      return Math.pow(x, a) * b;
    }

    function invf(x: number, a: number, b: number) {
      return Math.pow(x, 1/a) * b + (1 - b);
    }

    if (themeColor.hsl.l > 50) {
      textColor = themeColor.to('hsl');
      textColor.s = Math.pow(textColor.s / 100, 0.8) * 100;
      textColor.l = 10;

      commentaryColor = themeColor.to('hsl');
      commentaryColor.s = f(commentaryColor.s / 100, 1.5, 0.6) * 100;
      commentaryColor.l = f(commentaryColor.l / 100, 0.6, 0.5) * 100;
      commentaryColor.oklch.l = invf(textColor.oklch.l, 1, 0.7);

      linkColor = themeColor.to('hsl');
      linkColor.s = f(linkColor.s / 100, 1, 0.6) * 100;
      linkColor.l = f(linkColor.l / 100, 0.5, 0.6) * 100;
      linkColor.oklch.h = (linkColor.oklch.h + 20) % 360;
      linkColor.oklch.l = invf(textColor.oklch.l, 1, 0.6);

      highlightColor = themeColor.to('hsl');
      highlightColor.s = f(highlightColor.s / 100, 0.7, 1) * 100;
      highlightColor.l = f(themeColor.hsl.l / 100, 1, 0.9) * 100;
      highlightColor.oklch.h = (highlightColor.oklch.h - 25) % 360;
      highlightColor.oklch.l = f(themeColor.oklch.l, 0.9, 0.9);
    } else {
      textColor = themeColor.to('hsl');
      textColor.s = Math.pow(textColor.s / 100, 1.25) * 100;
      textColor.l = 95;

      commentaryColor = themeColor.to('hsl');
      commentaryColor.s = f(commentaryColor.s / 100, 1.5, 0.6) * 100;
      commentaryColor.l = invf(commentaryColor.l / 100, 0.6, 0.5) * 100;
      commentaryColor.oklch.l = f(textColor.oklch.l, 1, 0.8);

      linkColor = themeColor.to('hsl');
      linkColor.s = f(linkColor.s / 100, 1, 0.6) * 100;
      linkColor.l = invf(linkColor.l / 100, 0.5, 0.6) * 100;
      linkColor.oklch.h = (linkColor.oklch.h + 20) % 360;
      linkColor.oklch.l = f(textColor.oklch.l, 1, 0.9);

      highlightColor = themeColor.to('hsl');
      highlightColor.s = f(highlightColor.s / 100, 0.7, 1) * 100;
      highlightColor.l = invf(themeColor.hsl.l / 100, 1, 0.9) * 100;
      highlightColor.oklch.h = (highlightColor.oklch.h - 25) % 360;
      highlightColor.oklch.l = invf(themeColor.oklch.l, 0.9, 0.7);
    }
  }

  deriveColors();
</script>

<div class="vlayout fill">
<!-- main area -->
<div class="hlayout flexgrow" style="margin: 5px 0">

<!-- tools view -->
<div class="pane" style="width: 250px;" bind:this={left}>
  <TabView>
    <TabPage name="Options">
      <h5>Theme color</h5>
      <Colorpicker bind:color={themeColor} mode='hsl'
        onChange={() => {
          deriveColors();
          render();
        }} />
      <hr/>
      <label><input type="checkbox"
          bind:checked={autoColor} onchange={() => {
            if (!autoColor) return;
            deriveColors(); render();
          }}/>
        automatically derive the rest
      </label>
      <h5>Text color</h5>
      <Colorpicker color={textColor} mode='hsl'
        onChange={(x) => {
          textColor = x;
          render()
        }} />
      <h5>Commentary color</h5>
      <Colorpicker color={commentaryColor} mode='hsl'
        onChange={(x) => {
          commentaryColor = x;
          render()
        }} />
      <h5>Link color</h5>
      <Colorpicker color={linkColor} mode='hsl'
        onChange={(x) => {
          linkColor = x;
          render()
        }} />
      <h5>Highlight color</h5>
      <Colorpicker color={highlightColor} mode='hsl'
        onChange={(x) => {
          highlightColor = x;
          render()
        }} />
    </TabPage>
    <TabPage name="Problems">
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


<style>
  label {
    font-size: 85%;
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
    border: 1px solid whitesmoke;
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
