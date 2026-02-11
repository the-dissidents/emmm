<script lang="ts">
  import * as emmm from '@the_dissidents/libemmm';
  import { TabView, TabPage, Resizer, ListView } from '@the_dissidents/svelte-ui';
  import { CircleXIcon, InfoIcon, TriangleAlertIcon } from '@lucide/svelte';
  import { css } from '@codemirror/lang-css';
  import { bracketMatching, defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language';

  import Editor, { type EditorHandleOut } from './editor/Editor.svelte';

  import { Interface } from './Interface.svelte';
  import EmmmContext from './editor/EmmmContext.svelte';
  import GenericContext from './editor/GenericContext.svelte';
  import type { EmmmParseData } from './editor/ParseData';
  import ASTViewer from './emmm/ASTViewer.svelte';
  import { Memorized } from './config/Memorized.svelte';

  import WeixinToolbox from './integration/weixin/WeixinToolbox.svelte';
  import SearchToolbox from './toolbox/SearchToolbox.svelte';
  import ParametersToolbox from './toolbox/ParametersToolbox.svelte';
  import SyncToolbox from './toolbox/SyncToolbox.svelte';
  import TestToolbox from './toolbox/TestToolbox.svelte';

  import type { EmmmDiagnostic } from './editor/Linter';
  import { Debug } from './Debug';

  let left = $state<HTMLElement>(),
      middle = $state<HTMLElement>(),
      right = $state<HTMLElement>(),
      bottom = $state<HTMLElement>();

  let strip = $state(false);
  let parsedStatus = $state('');
  let posStatus = $state('line ?, col ?');
  let sourceHandle = $state<EditorHandleOut>(),
      libraryHandle = $state<EditorHandleOut>(),
      cssHandle = $state<EditorHandleOut>();

  $effect(() => {
    Interface.sourceEditor = sourceHandle;
  });

  let status = Interface.status,
      parseData = Interface.parseData,
      progress = Interface.progress;

  let source = Interface.source,
      library = Interface.library,
      stylesheet = Interface.stylesheet;

  let libConfig = $state<emmm.Configuration>();

  function onParseLibrary(doc: EmmmParseData) {
    libConfig = doc.data.context.config;
    if (Interface.activeEditor !== libraryHandle)
      setTimeout(() => sourceHandle?.reparse(), 0);
  }

  function onCursorPositionChanged(_: number, l: number, c: number) {
    posStatus = `line ${l}, col ${c}`;
  }

  function updateCursorPosition(h?: EditorHandleOut) {
    if (!h?.getCursorPosition) return;
    onCursorPositionChanged(...h.getCursorPosition());
  }

  function onParseSource(doc: EmmmParseData) {
    parsedStatus = `parsed in ${doc.parseTime.toFixed(0)}ms`;
    Interface.parseData.set({...doc});
    Interface.requestRender();

    if (!Interface.activeEditor)
      Interface.activeEditor = sourceHandle;
  }

  let diagnostics: EmmmDiagnostic[] = $state([]);
</script>

<div class="vlayout fill">

<!-- main area -->
<div class="hlayout flexgrow">

<!-- tools view -->
<div class="pane" style="width: 300px;" bind:this={left}>
  <TabView>
    <TabPage id='File' header="File">
      <SyncToolbox />
    </TabPage>
    <TabPage id='Weixin' header="Weixin">
      <WeixinToolbox />
    </TabPage>
    <TabPage id="Parameters" header="Parameters">
      <ParametersToolbox />
    </TabPage>
    <TabPage id='Search' header="Search">
      <SearchToolbox />
    </TabPage>
    <TabPage id='Eggs' header="Eggs">
      <TestToolbox />
    </TabPage>
  </TabView>
</div>

<div style="width: 5px;" class="hcenter">
  <Resizer first={left} second={middle} vertical={true} />
</div>

<!-- source view -->
<div class="pane flexgrow" bind:this={middle}>
  <TabView>
    <TabPage id="Source" header="Source"
        onActivate={() => sourceHandle?.focus?.()}>
      <EmmmContext onParse={onParseSource}
          provideDescriptor={() => ({name: '<Source>'})}
          provideContext={() => libConfig
            ? new emmm.ParseContext(emmm.Configuration.from(libConfig, true))
            : undefined
          }
          onLint={(d) => diagnostics = d}
      >
        <Editor bind:text={$source}
          onFocus={() => {
            updateCursorPosition(sourceHandle);
            Interface.activeEditor = sourceHandle;
          }}
          {onCursorPositionChanged}
          bind:hout={sourceHandle} />
      </EmmmContext>
    </TabPage>
    <TabPage id="Library" header="Library"
        onActivate={() => libraryHandle?.focus?.()}>
      <EmmmContext onParse={onParseLibrary}
          provideDescriptor={() => ({name: '<Library>'})}>
        <Editor bind:text={$library}
          onFocus={() => {
            updateCursorPosition(libraryHandle);
            Interface.activeEditor = libraryHandle;
          }}
          {onCursorPositionChanged}
          bind:hout={libraryHandle} />
      </EmmmContext>
    </TabPage>
    <TabPage id="Stylesheet" header="Stylesheet">
      <GenericContext extension={[
        syntaxHighlighting(defaultHighlightStyle),
        bracketMatching(),
        css()
      ]}>
        <Editor bind:text={$stylesheet}
          onFocus={() => {
            updateCursorPosition(cssHandle);
            Interface.activeEditor = cssHandle;
          }}
          {onCursorPositionChanged}
          onChange={() => Interface.requestRender()}
          bind:hout={cssHandle} />
      </GenericContext>
    </TabPage>
  </TabView>
</div>

<div style="width: 5px;" class="hcenter">
  <Resizer first={bottom!} second={middle} vertical={true} reverse={true} />
</div>

<!-- preview -->
<div class="pane" bind:this={right} style="width: 500px;">
  <TabView>
    <TabPage id="Preview" header="Preview" active={true}>
      <iframe bind:this={Interface.frame} title="preview"
        sandbox="allow-same-origin">
      </iframe>
    </TabPage>
    <TabPage id="AST" header="AST" lazy={true}>
      <div class="vlayout fill">
        <div class="ast">
          <ASTViewer node={strip ? $parseData?.data.toStripped().root : $parseData?.data.root} />
        </div>
        <label>
          <input type="checkbox" bind:checked={strip} />
          only show transformed (stripped) AST
        </label>
        <button onclick={() => {
          emmm.setDebugLevel(emmm.DebugLevel.Trace);
          new emmm.ParseContext(libConfig!).parse(new emmm.SimpleScanner($source));
          emmm.setDebugLevel(emmm.DebugLevel.Error);
        }}>trace</button>
      </div>
    </TabPage>
    <TabPage id="HTML" header="AST">
      <textarea class="fill">{Interface.renderedDocument?.documentElement.outerHTML}</textarea>
    </TabPage>
  </TabView>
</div>
</div>

<div style="height: 5px;" class="vcenter">
  <Resizer first={bottom!} reverse={true} />
</div>
<div class="pane" style="height: 100px" bind:this={bottom}>
  <ListView style='height: 100%' items={diagnostics}
    columns={[
      ['file',    { header: 'file',    width: 'minmax(max-content, 5em)' }],
      ['type',    { header: '',        width: '3em' }],
      ['line',    { header: 'line',    width: '4em' }],
      ['column',  { header: 'col',     width: '4em' }],
      ['message', { header: 'message', width: 'auto' }],
    ]}
    onClickItem={(x) => {
      if (x.location.source.name == '<Source>')
        Interface.sourceEditor?.setSelections([{ from: x.from, to: x.to }]);
    }}
  >
    {#snippet file(d)}
      {d.location.source.name}
    {/snippet}
  {#snippet type(d)}
      {#if d.severity == 'error'}
        <CircleXIcon color="red" strokeWidth="2px"/>
      {:else if d.severity == 'hint'}
        <InfoIcon/>
      {:else if d.severity == 'info'}
        <InfoIcon/>
      {:else if d.severity == 'warning'}
        <TriangleAlertIcon color="red" strokeWidth="2px" />
      {:else}
        {Debug.never(d.severity)}
      {/if}
    {/snippet}
    {#snippet line(d)}
      {d.row + 1}
    {/snippet}
    {#snippet column(d)}
      {d.col + 1}
    {/snippet}
    {#snippet message(d)}
      {d.message}
    {/snippet}
  </ListView>
</div>

<div class="pane">
  <div class='hlayout status'>
    <span class='flexgrow'>
      {$status}
    </span>
    {#if $progress !== undefined}
      <hr>
      <span>
        <progress max="1" value={$progress}></progress>
      </span>
    {/if}
    <hr/>
    <span>
      {posStatus}
    </span>
    <hr/>
    <span>
      {parsedStatus}
    </span>
    <hr/>
    <button onclick={async () => {
      await Memorized.save();
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

  .ast {
    flex-grow: 1;
    overflow-y: scroll;
    background-color: white;
    border-radius: 3px;
    padding: 5px;
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
