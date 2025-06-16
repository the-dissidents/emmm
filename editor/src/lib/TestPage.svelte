<script lang="ts">
  import WeixinToolbox from './WeixinToolbox.svelte';

  import * as emmm from '@the_dissidents/libemmm';

  import Editor, { type EditorHandleOut } from './Editor.svelte';
  import Resizer from './ui/Resizer.svelte';
  import TabView from './ui/TabView.svelte';
  import TabPage from './ui/TabPage.svelte';

  import type { EmmmParseData } from './EditorTheme';
  import Colorpicker from './ui/Colorpicker.svelte';
  import { deriveColorsFrom } from './ColorTheme';
  import ListView, { type ListColumn, type ListViewHandleOut } from './ui/ListView.svelte';
  import { SvelteMap } from 'svelte/reactivity';
  import { Interface } from './Interface.svelte';
  import { Settings } from './Settings';

  import testStyles from './typesetting.css?raw';
  import testString from './testsource.txt?raw';
  import testLib from './testlib.txt?raw';
  
  import { onMount } from 'svelte';
  import EmmmContext from './EmmmContext.svelte';
  import { CustomConfig } from './custom/Custom';
    import SearchToolbox from './SearchToolbox.svelte';

  let outputAST = $state('');
  let left = $state<HTMLElement>(), 
      middle = $state<HTMLElement>(), 
      right = $state<HTMLElement>(),
      bottom = $state<HTMLElement>();

  let strip = $state(false);
  let status = Interface.status;
  let parsedStatus = $state('');
  let posStatus = $state('line ?, col ?');
  let sourceHandle = $state<EditorHandleOut>({}),
      libraryHandle = $state<EditorHandleOut>({});
  
  let source = $state(''),
      library = $state('');

  let config: emmm.Configuration;
  {
    emmm.setDebugLevel(emmm.DebugLevel.Warning);
    let lib = emmm.parse(
      new emmm.SimpleScanner(testLib), 
      new emmm.ParseContext(
        emmm.Configuration.from(CustomConfig)));
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
    Interface.parseData.set(doc);
    outputAST = emmm.debugPrint.document(strip ? doc.data.toStripped() : doc.data);
    Interface.render();
  }

  const problemListHeader = new SvelteMap<string, ListColumn>([
    ['file', {name: 'file', type: 'text', vAlign: 'top', width: '5%'}],
    ['type', {name: 'T', type: 'text', vAlign: 'top', width: '5%'}],
    ['code', {name: '#', type: 'text', vAlign: 'top', width: '5%'}],
    ['line', {name: 'line', type: 'text', vAlign: 'top', width: '5%'}],
    ['column', {name: 'column', type: 'text', vAlign: 'top', width: '5%'}],
    ['length', {name: 'length', type: 'text', vAlign: 'top', width: '5%'}],
    ['msg', {name: 'message', type: 'text'}]
  ]);
  let problemListHandleOut: ListViewHandleOut | undefined = $state();

  Interface.parseData.subscribe((pd) => {
    problemListHandleOut?.reset(pd!.data.messages.map((x) => {
      const source = x.location.source;
      return {
        cols: {
          file: {type: 'text', content: x.location.source.name},
          type: {type: 'text', content: {
            [emmm.MessageSeverity.Warning]: '⚠️',
            [emmm.MessageSeverity.Error]: '❌',
            [emmm.MessageSeverity.Info]: 'ℹ️'
          }[x.severity]},
          code: {type: 'text', content: `${x.code}`},
          line: {type: 'text', content: `${source.getRowCol(x.location.start)[0] + 1}`},
          column: {type: 'text', content: `${source.getRowCol(x.location.start)[1] + 1}`},
          length: {type: 'text', content: `${(x.location.actualEnd ?? x.location.end) - x.location.start + 1}`},
          msg: {type: 'text', content: x.info},
        }
      }
    }));
  });

  let autoColor = $state(true);

  function doDeriveColors() {
    if (autoColor) Interface.colors = deriveColorsFrom(Interface.colors.theme);
    Interface.render();
  }

  doDeriveColors();

  onMount(() => {
    Settings.onInitialized(() => {
      Interface.stylesheet = Settings.get('tempStylesheet') || testStyles;
      library = Settings.get('tempLibrary') || testLib;
      source = Settings.get('tempSource') || testString;
    });
  })
</script>

<div class="vlayout fill">

<!-- main area -->
<div class="hlayout flexgrow">

<!-- tools view -->
<div class="pane" style="width: 300px;" bind:this={left}>
  <TabView>
    <TabPage name='Weixin'>
      <WeixinToolbox />
    </TabPage>
    <TabPage name="Options">
      <h5>Theme color</h5>
      <Colorpicker bind:color={Interface.colors.theme} mode='hsl'
        onChange={doDeriveColors} />
      <hr/>
      <label><input type="checkbox"
          bind:checked={autoColor} onchange={doDeriveColors} />
        automatically derive the rest
      </label>
      <h5>Text color</h5>
      <Colorpicker bind:color={Interface.colors.text} mode='hsl'
        onChange={doDeriveColors} />
      <h5>Commentary color</h5>
      <Colorpicker bind:color={Interface.colors.commentary} mode='hsl'
        onChange={doDeriveColors} />
      <h5>Link color</h5>
      <Colorpicker bind:color={Interface.colors.link} mode='hsl'
        onChange={doDeriveColors} />
      <h5>Highlight color</h5>
      <Colorpicker bind:color={Interface.colors.highlight} mode='hsl'
        onChange={doDeriveColors} />
    </TabPage>
    <TabPage name='Search'>
      <SearchToolbox />
    </TabPage>
  </TabView>
</div>

<div style="width: 5px;" class="hcenter">
  <Resizer first={left} second={middle} vertical={true} />
</div>

<!-- source view -->
<div class="pane flexgrow" bind:this={middle}>
  <TabView>
    <TabPage name="Source" 
        onActivate={() => sourceHandle?.focus?.()}>
      <EmmmContext {onParse} 
          provideDescriptor={() => ({name: '<Source>'})}
          provideContext={getContext}>
        <Editor bind:text={source}
          onFocus={() => updateCursorPosition(sourceHandle)}
          {onCursorPositionChanged}
          bind:hout={sourceHandle} />
      </EmmmContext>
    </TabPage>
    <TabPage name="Library"
        onActivate={() => libraryHandle?.focus?.()}>
      <EmmmContext onParse={onParseLibrary}
          provideDescriptor={() => ({name: '<Source>'})}>
        <Editor bind:text={library}
          onFocus={() => updateCursorPosition(libraryHandle)}
          {onCursorPositionChanged}
          bind:hout={libraryHandle} />
      </EmmmContext>
    </TabPage>
    <TabPage name="CSS">
      <Editor bind:text={Interface.stylesheet}
        onFocus={() => updateCursorPosition(libraryHandle)}
        {onCursorPositionChanged}
        onChange={() => {
          Interface.render();
        }}/>
    </TabPage>
  </TabView>
</div>

<div style="width: 5px;" class="hcenter">
  <Resizer first={right} second={middle} vertical={true} reverse={true} />
</div>

<!-- preview -->
<div class="pane" bind:this={right} style="width: 500px;">
  <TabView>
    <TabPage name="Preview" active={true}>
      <iframe bind:this={Interface.frame} title="preview" 
        sandbox="allow-same-origin">
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
      <textarea class="fill">{Interface.renderedDocument?.documentElement.outerHTML}</textarea>
    </TabPage>
  </TabView>
</div>
</div>

<div style="height: 5px;" class="vcenter">
  <Resizer first={bottom} reverse={true} />
</div>

<div class="pane" style="height: 100px" bind:this={bottom}>
  <ListView header={problemListHeader} bind:hout={problemListHandleOut}/>
</div>

<div class="pane">
  <div class='hlayout status'>
    <span class='flexgrow'>
      {$status}
    </span>
    <hr/>
    <span>
      {posStatus}
    </span>
    <hr/>
    <span>
      {parsedStatus}
    </span>
    <hr/>
    <button onclick={() => {
      Settings.set('tempSource', source);
      Settings.set('tempLibrary', library);
      Settings.set('tempStylesheet', Interface.stylesheet);
      status.set('saved');
    }}>
      save
    </button>
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
    border: 1px solid gray;
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
    font-size: 100%;
    font-family: inherit;
    /* font-size: 13.6px; */
    display: inline-block;
    background-color: transparent;
    border: none;
    border-radius: 0;
    box-shadow: none;
    margin: 0;
    /* padding: 0 5px; */

    &:hover {
      background-color: color-mix(in srgb, lightpink, white 40%);
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
