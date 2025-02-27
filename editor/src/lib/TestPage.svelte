<script lang="ts">
  import * as emmm from '@the_dissidents/libemmm';

  import Editor from './Editor.svelte';
  import Resizer from './ui/Resizer.svelte';
  import TabView from './ui/TabView.svelte';
  import TabPage from './ui/TabPage.svelte';

  import testString from './testsource.txt?raw';
  import testLib from './testlib.txt?raw';
  import testStyles from './typesetting.css?raw';
  import type { EmmmParseData } from './EditorTheme';

  let outputAST = $state('');
  let renderedHTML = $state('');
  let left = $state<HTMLElement>(), right = $state<HTMLElement>();

  let strip = $state(false);
  let status = $state('ok');
  let parsedStatus = $state('');
  let posStatus = $state('line ?, col ?');

  let config: emmm.Configuration;
  {
    let lib = emmm.parse(
      new emmm.SimpleScanner(testLib), 
      new emmm.ParseContext(
        emmm.Configuration.from(emmm.DefaultConfiguration)));
    config = lib.context.config;
  }

  function onparseLibrary(doc: EmmmParseData) {
    config = doc.data.context.config;
  }

  function getContext() {
    return new emmm.ParseContext(emmm.Configuration.from(config));
  }

  function onparse(doc: EmmmParseData, source: string) {
    parsedStatus = `parsed in ${doc.time.toFixed(0)}ms`;
    let newDoc = strip ? doc.data.toStripped() : doc.data;
    outputAST = emmm.debugPrint.document(newDoc, source);

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
    state.stylesheet = testStyles;
    renderedHTML = renderConfig.render(doc.data, state);
  }

  async function copyHTML() {
    await navigator.clipboard.write([new ClipboardItem({'text/html': renderedHTML})]);
    // await clipboard.writeHtml(renderedHTML);
    console.log(renderedHTML);
    status = 'copied';
  }
</script>

<div class="vlayout fill">
<!-- main area -->
<div class="hlayout flexgrow" style="margin: 5px 0">
<!-- source view -->
<div class="pane flexgrow" bind:this={left}>
  <TabView>
    <TabPage name="Source">
      <Editor descriptor={{ name: '<Source>' }}
        onparse={onparse}
        initialText={testString} {getContext} />
    </TabPage>
    <TabPage name="Library">
      <Editor descriptor={{ name: '<Library>' }}
        onparse={onparseLibrary} 
        initialText={testLib} />
    </TabPage>
  </TabView>
</div>

<Resizer first={left} second={right} vertical={true} reverse={true} />

<!-- preview -->
<div class="pane" bind:this={right} style="width: 500px;">
  <TabView>
    <TabPage name="Preview" active={true}>
      <iframe title="preview" srcdoc={renderedHTML} sandbox="">
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
