<script lang="ts">
  import * as emmm from '@the_dissidents/libemmm';
  import { TabView, TabPage, Resizer, ListView } from '@the_dissidents/svelte-ui';
  import { CircleXIcon, InfoIcon, TriangleAlertIcon } from '@lucide/svelte';
  import { sass as sassLang } from '@codemirror/lang-sass';
  import { bracketMatching, defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language';
  import { _ } from 'svelte-i18n';
  import { untrack } from 'svelte';
  import * as dialog from '@tauri-apps/plugin-dialog';

  import Editor from './editor/Editor.svelte';

  import { Interface } from './Interface.svelte';
  import { Workspace } from './workspace/Workspace.svelte';
  import type { Document } from './workspace/Document.svelte';
  import EmmmContext from './editor/EmmmContext.svelte';
  import GenericContext from './editor/GenericContext.svelte';
  import type { EmmmParseData } from './editor/ParseData';
  import ASTViewer from './emmm/ASTViewer.svelte';

  import WeixinToolbox from './integration/weixin/WeixinToolbox.svelte';
  import SearchToolbox from './toolbox/SearchToolbox.svelte';
  import ParametersToolbox from './toolbox/ParametersToolbox.svelte';
  import FileToolbox from './toolbox/FileToolbox.svelte';
  import TestToolbox from './toolbox/TestToolbox.svelte';

  import type { EmmmDiagnostic } from './editor/EmmmLinter';
  import { Debug } from './Debug';
  import { DebouncedTask } from './details/DebouncedTask';

  import { sassLinter } from './editor/SassLinter';

  if (Workspace.documents.length === 0)
    Workspace.newDocument();

  let left = $state<HTMLElement>(),
      middle = $state<HTMLElement>(),
      right = $state<HTMLElement>(),
      bottom = $state<HTMLElement>();

  let strip = $state(false);
  let parsedStatus = $state('');
  let posStatus = $state('');

  let activeTab = $state<string | undefined>(Workspace.activeId ?? undefined);

  let libraryHandle = $state<Editor>(),
      cssHandle = $state<Editor>();

  $effect(() => {
    const id = Workspace.activeId;
    if (id && id !== untrack(() => activeTab))
      activeTab = id;
  });

  let status = Interface.status,
      progress = Interface.progress,
      inverted = Interface.invertedPreview,
      syncScrolling = Interface.syncScrolling;

  let library = Interface.library,
      stylesheet = Interface.stylesheet;

  let sassDiag: EmmmDiagnostic[] = $state([]);

  function onParseLibrary(doc: EmmmParseData) {
    Interface.libConfig = doc.data.context.config;
    for (const d of Workspace.documents)
      d.editor?.reparse();
  }

  function onParseDocument(doc: Document, data: EmmmParseData) {
    doc.parseData = data;
    parsedStatus = $_('main.parsed-in', { values: { ms: data.parseTime.toFixed(0) } });
    if (Workspace.activeId === doc.id)
      Interface.requestRender();
  }

  function onCursorPositionChanged(doc: Document, pos: number, l: number, c: number) {
    posStatus = $_('main.cursor-position', { values: { l, c } });
    if (Workspace.activeId === doc.id)
      scrollToSource.start(pos, false);
  }

  function onGenericCursorChanged(_pos: number, l: number, c: number) {
    posStatus = $_('main.cursor-position', { values: { l, c } });
  }

  function updateCursorPosition(h?: Editor) {
    if (!h?.getCursorPosition) return;
    const [, l, c] = h.getCursorPosition();
    posStatus = $_('main.cursor-position', { values: { l, c } });
  }

  async function closeDocument(doc: Document) {
    if (doc.dirty && !(await dialog.confirm(
      $_('file.msg.confirm-close', { values: { name: doc.name } }))))
      return;
    const next = Workspace.close(doc);
    if (next) activeTab = next.id;
  }

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
      <FileToolbox />
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
  <TabView current={activeTab}>
    {#each Workspace.documents as doc (doc.id)}
      <TabPage id={doc.id} reorderable={true}
          header={doc.dirty ? `${doc.name} •` : doc.name}
          onActivate={() => {
            Workspace.activeId = doc.id;
            Interface.requestRender();
            doc.editor?.focus?.();
          }}
          onCloseRequested={() => closeDocument(doc)}>
        <EmmmContext onParse={(data) => onParseDocument(doc, data)}
            provideDescriptor={() => ({ name: doc.name })}
            provideContext={() => Interface.libConfig
              ? new emmm.ParseContext(emmm.Configuration.from(Interface.libConfig, true))
              : undefined}
            onLint={(d) => doc.diagnostics = d}>
          <Editor bind:text={doc.source}
            bind:this={doc.editor}
            onFocus={() => {
              Workspace.activeId = doc.id;
              updateCursorPosition(doc.editor);
            }}
            onChange={() => doc.dirty = true}
            onScroll={(_, view) => {
              if (!$syncScrolling) return;
              if (Workspace.activeId !== doc.id) return;

              const rect = view.scrollDOM.getBoundingClientRect();
              const pos = view.posAtCoords({ x: 0, y: rect.top + rect.height / 2 });
              if (pos === null) return;
              scrollToSource.start(pos, false);
            }}
            onCursorPositionChanged={(pos, l, c) => onCursorPositionChanged(doc, pos, l, c)} />
        </EmmmContext>
      </TabPage>
    {/each}
    <TabPage id="Library" header={$_('tab.library')} alignment='end'
        onActivate={() => libraryHandle?.focus?.()}>
      <EmmmContext onParse={onParseLibrary}
          provideDescriptor={() => ({name: '<Library>'})}>
        <Editor bind:text={$library}
          bind:this={libraryHandle}
          onFocus={() => updateCursorPosition(libraryHandle)}
          onCursorPositionChanged={onGenericCursorChanged} />
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
          onFocus={() => updateCursorPosition(cssHandle)}
          onCursorPositionChanged={onGenericCursorChanged}
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
          <ASTViewer node={strip ? Workspace.active?.parseData?.data.toStripped().root : Workspace.active?.parseData?.data.root} />
        </div>
        <hr>
        <label>
          <input type="checkbox" bind:checked={strip} />
          {$_('main.show-stripped-ast')}
        </label>
        <button onclick={() => {
          const source = Workspace.active?.source;
          if (!source || !Interface.libConfig) return;
          emmm.setDebugLevel(emmm.DebugLevel.Trace);
          new emmm.ParseContext(Interface.libConfig).parse(new emmm.SimpleScanner(source));
          emmm.setDebugLevel(emmm.DebugLevel.Error);
        }}>{$_('main.trace')}</button>
      </div>
    </TabPage>
    <TabPage id="HTML" header={$_('tab.html')}>
      <textarea class="vfill">{Interface.renderedHTML}</textarea>
    </TabPage>
  </TabView>
</div>
</div>

<div style="height: 5px;" class="vcenter">
  <Resizer first={bottom!} reverse={true} />
</div>
<div class="pane" style="height: 100px" bind:this={bottom}>
  <ListView style='height: 100%'
    items={[...sassDiag, ...(Workspace.active?.diagnostics ?? [])]}
    columns={[
      ['file',    { header: $_('main.column-file'),    width: 'minmax(max-content, 5em)' }],
      ['type',    { header: '',        width: '3em' }],
      ['line',    { header: $_('main.column-line'),    width: '4em' }],
      ['column',  { header: $_('main.column-col'),     width: '4em' }],
      ['message', { header: $_('main.column-message'), width: 'auto' }],
    ]}
    onClickItem={(x) => {
      const doc = Workspace.active;
      if (doc && x.source == doc.name)
        doc.editor?.setSelections([{ from: x.from, to: x.to }]);
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
    display: inline-block;
    background-color: transparent;
    border: none;
    border-radius: 0;
    box-shadow: none;
    margin: 0;

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
