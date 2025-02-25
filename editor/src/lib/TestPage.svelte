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
  let status = $state('ok');
  let strip = $state(false);

  let config: emmm.Configuration | undefined;

  function onparseLibrary(doc: EmmmParseData, source: string) {
    config = doc.data.context.config;
  }

  function getContext() {
    return new emmm.ParseContext(emmm.Configuration.from(config ?? emmm.DefaultConfiguration));
  }

  function onparse(doc: EmmmParseData, source: string) {
    status = `parsed in ${doc.time.toFixed(0)}ms`;
    let newDoc = strip ? doc.data.toStripped() : doc.data;
    outputAST = emmm.debugPrint.document(newDoc, source);

    let renderConfig = emmm.HTMLRenderConfiguration;
    let state = new emmm.HTMLRenderState();
    state.stylesheet = testStyles;
    renderedHTML = renderConfig.render(doc.data, state);
  }
</script>

<div class="vlayout fill">
<!-- main area -->
<div class="hlayout flexgrow">
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
      <iframe class="fill" title="preview" srcdoc={renderedHTML} sandbox="">
      </iframe>
    </TabPage>
    <TabPage name="AST">
      <div class="vlayout fill">
        <textarea class="flexgrow">{outputAST}</textarea>
        <span>{status}</span>
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

<div>
  Status
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
    border: 1px solid black;
  }
</style>
