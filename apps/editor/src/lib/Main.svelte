<script lang="ts">
  import * as emmm from '@the_dissidents/libemmm';
  import { TabView, TabPage, Resizer, ListView } from '@the_dissidents/svelte-ui';
  import { CircleXIcon, InfoIcon, TriangleAlertIcon, X } from '@lucide/svelte';
  import { sass as sassLang } from '@codemirror/lang-sass';
  import { bracketMatching, defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language';
  import { _ } from 'svelte-i18n';

  import Editor from './editor/Editor.svelte';

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

  import type { EmmmDiagnostic } from './editor/EmmmLinter';
  import { Debug } from './Debug';
  import { DebouncedTask } from './details/DebouncedTask';

  import * as sass from 'sass';
  import { sassLinter } from './editor/SassLinter';

  let left = $state<HTMLElement>(),
      middle = $state<HTMLElement>(),
      right = $state<HTMLElement>(),
      bottom = $state<HTMLElement>();

  let strip = $state(false);
  let parsedStatus = $state('');
  let posStatus = $state('');
  let sourceHandle = $state<Editor>(),
      libraryHandle = $state<Editor>(),
      cssHandle = $state<Editor>();

  $effect(() => {
    Interface.sourceEditor = sourceHandle;
  });

  let status = Interface.status,
      parseData = Interface.parseData,
      progress = Interface.progress,
      inverted = Interface.invertedPreview,
      syncScrolling = Interface.syncScrolling;

  let source = Interface.source,
      library = Interface.library,
      stylesheet = Interface.stylesheet;

  let libConfig = $state<emmm.Configuration>();

  function onParseLibrary(doc: EmmmParseData) {
    libConfig = doc.data.context.config;
    if (Interface.activeEditor !== libraryHandle)
      setTimeout(() => sourceHandle?.reparse(), 0);
  }

  function onCursorPositionChanged(pos: number, l: number, c: number) {
    posStatus = $_('main.cursor-position', { values: { l, c } });
    if (Interface.activeEditor === sourceHandle) {
      scrollToSource.start(pos, false);
    }
  }

  function updateCursorPosition(h?: Editor) {
    if (!h?.getCursorPosition) return;
    onCursorPositionChanged(...(h.getCursorPosition()));
  }

  function onParseSource(doc: EmmmParseData) {
    parsedStatus = $_('main.parsed-in', { values: { ms: doc.parseTime.toFixed(0) } });
    Interface.parseData.set({...doc});
    Interface.requestRender();

    if (!Interface.activeEditor)
      Interface.activeEditor = sourceHandle;
  }

  let emmmDiag: EmmmDiagnostic[] = $state([]);
  let sassDiag: EmmmDiagnostic[] = $state([]);

  const scrollToSource = new DebouncedTask(
    (pos: number, select: boolean) => Interface.scrollToSource(pos, select), 500);
</script>

<div class="vlayout flexgrow">

<!-- main area -->
<div class="hlayout flexgrow">

<!-- tools view -->
<div class="pane" style="width: 300px;" bind:this={left}>
  <TabView>
    <TabPage id='File' header={$_('tab.file')}>
      <SyncToolbox />
    </TabPage>
    <TabPage id='Weixin' header={$_('tab.weixin')}>
      <WeixinToolbox />
    </TabPage>
    <TabPage id="Parameters" header={$_('tab.parameters')}>
      <ParametersToolbox />
    </TabPage>
    <TabPage id='Search' header={$_('tab.search')}>
      <SearchToolbox />
    </TabPage>
    <TabPage id='Eggs' header={$_('tab.eggs')}>
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
    <TabPage id="Source" header={$_('tab.source')}
        onActivate={() => sourceHandle?.focus?.()}>
      <EmmmContext onParse={onParseSource}
          provideDescriptor={() => ({name: '<Source>'})}
          provideContext={() => libConfig
            ? new emmm.ParseContext(emmm.Configuration.from(libConfig, true))
            : undefined
          }
          onLint={(d) => emmmDiag = d}
      >
        <Editor bind:text={$source}
          bind:this={sourceHandle}
          onFocus={() => {
            updateCursorPosition(sourceHandle);
            Interface.activeEditor = sourceHandle;
          }}
          onScroll={(_, view) => {
            if (!$syncScrolling) return;

            const rect = view.scrollDOM.getBoundingClientRect();
            const pos = view.posAtCoords({ x: 0, y: rect.top + rect.height / 2 });
            if (pos === null) return;
            scrollToSource.start(pos, false);
          }}
          {onCursorPositionChanged} />
      </EmmmContext>
    </TabPage>
    <TabPage id="Library" header={$_('tab.library')} alignment='end'
        onActivate={() => libraryHandle?.focus?.()}>
      <EmmmContext onParse={onParseLibrary}
          provideDescriptor={() => ({name: '<Library>'})}>
        <Editor bind:text={$library}
          bind:this={libraryHandle}
          onFocus={() => {
            updateCursorPosition(libraryHandle);
            Interface.activeEditor = libraryHandle;
          }}
          {onCursorPositionChanged} />
      </EmmmContext>
    </TabPage>
    <TabPage id="Stylesheet" header={$_('tab.stylesheet')} alignment='end'>
      <GenericContext extension={[
        syntaxHighlighting(defaultHighlightStyle),
        bracketMatching(),
        sassLang(),
        sassLinter((m) => sassDiag = m),
      ]}>
        <Editor bind:text={$stylesheet}
          bind:this={cssHandle}
          onFocus={() => {
            updateCursorPosition(cssHandle);
            Interface.activeEditor = cssHandle;
          }}
          {onCursorPositionChanged}
          onChange={() => Interface.requestRender()} />
      </GenericContext>
    </TabPage>
  </TabView>
</div>

<div style="width: 5px;" class="hcenter">
  <Resizer first={right!} second={middle} vertical={true} reverse={true} />
</div>

<!-- preview -->
<div class="pane" bind:this={right} style="width: 500px;">
  <TabView>
    <TabPage id="Preview" header={$_('tab.preview')}>
      <div class="vlayout vfill">
        <fieldset>
          <label>
            <input type='checkbox' class="button" bind:checked={$syncScrolling}>
            {$_('main.sync-scrolling')}
          </label>
        </fieldset>
        <iframe bind:this={Interface.frame}
          class={{inverted: $inverted, flexgrow: true}} title="preview"
          sandbox="allow-same-origin allow-scripts">
        </iframe>
      </div>
    </TabPage>
    <TabPage id="AST" header={$_('tab.ast')} lazy={true}>
      <div class="vlayout vfill">
        <div class="ast">
          <ASTViewer node={strip ? $parseData?.data.toStripped().root : $parseData?.data.root} />
        </div>
        <hr>
        <label>
          <input type="checkbox" bind:checked={strip} />
          {$_('main.show-stripped-ast')}
        </label>
        <button onclick={() => {
          emmm.setDebugLevel(emmm.DebugLevel.Trace);
          new emmm.ParseContext(libConfig!).parse(new emmm.SimpleScanner($source));
          emmm.setDebugLevel(emmm.DebugLevel.Error);
        }}>{$_('main.trace')}</button>
      </div>
    </TabPage>
    <TabPage id="HTML" header={$_('tab.html')}>
      <textarea class="vfill">{Interface.renderedDocument?.documentElement.outerHTML}</textarea>
    </TabPage>
  </TabView>
</div>
</div>

<div style="height: 5px;" class="vcenter">
  <Resizer first={bottom!} reverse={true} />
</div>
<div class="pane" style="height: 100px" bind:this={bottom}>
  <ListView style='height: 100%' items={[...sassDiag, ...emmmDiag]}
    columns={[
      ['file',    { header: $_('main.column-file'),    width: 'minmax(max-content, 5em)' }],
      ['type',    { header: '',        width: '3em' }],
      ['line',    { header: $_('main.column-line'),    width: '4em' }],
      ['column',  { header: $_('main.column-col'),     width: '4em' }],
      ['message', { header: $_('main.column-message'), width: 'auto' }],
    ]}
    onClickItem={(x) => {
      if (x.source == '<Source>')
        Interface.sourceEditor?.setSelections([{ from: x.from, to: x.to }]);
    }}
  >
    {#snippet file(d)}
      {d.source}
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
      status.set($_('main.saved'));
    }}>
      {$_('main.save')}
    </button>
  </div>
</div>

</div>

<style lang='scss'>
  label {
    font-size: 85%;
  }

  .pane {
    padding: 2px;
  }

  fieldset {
    padding-bottom: 5px;
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

    &.inverted {
      @media (prefers-color-scheme: dark) {
        filter: invert(100%);
      }
    }
  }

  .ast {
    flex-grow: 1;
    overflow-y: scroll;
    // background-color: white;
    border-radius: 3px;
    padding: 5px;
  }

  .status {
    font-size: 85%;
    border-radius: 3px;
    padding: 0 10px;

    @media (prefers-color-scheme: light) {
      border: 1px solid pink;
      background-color: lightpink;
    }
    @media (prefers-color-scheme: dark) {
      border: 1px solid rgb(118, 81, 147);
      background-color: rgb(66, 53, 79);
    }
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
