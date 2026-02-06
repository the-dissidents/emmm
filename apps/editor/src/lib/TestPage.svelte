<script lang="ts">
  import WeixinToolbox from './integration/weixin/WeixinToolbox.svelte';

  import * as emmm from '@the_dissidents/libemmm';
  import { css } from '@codemirror/lang-css';
  import { bracketMatching, defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language';

  import Editor, { type EditorHandleOut } from './editor/Editor.svelte';
  import Resizer from './ui/Resizer.svelte';
  import TabView from './ui/TabView.svelte';
  import TabPage from './ui/TabPage.svelte';

  import ListView, { type ListColumn, type ListViewHandleOut } from './ui/ListView.svelte';
  import { SvelteMap } from 'svelte/reactivity';
  import { Interface } from './Interface.svelte';
  import EmmmContext from './editor/EmmmContext.svelte';
  import GenericContext from './editor/GenericContext.svelte';
  import SearchToolbox from './toolbox/SearchToolbox.svelte';
  import type { EmmmParseData } from './editor/ParseData';4
  import ParametersToolbox from './toolbox/ParametersToolbox.svelte';
  import ASTViewer from './emmm/ASTViewer.svelte';
  import { Memorized } from './config/Memorized.svelte';

  import SyncToolbox from './toolbox/SyncToolbox.svelte';
  import type { EmmmDiagnostic } from './editor/Linter';

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

  function onParse(doc: EmmmParseData) {
    parsedStatus = `parsed in ${doc.parseTime.toFixed(0)}ms`;
    Interface.parseData.set({...doc});
    Interface.requestRender();
  }

  const problemListHeader = new SvelteMap<string, ListColumn>([
    ['file', {name: 'file', type: 'text', vAlign: 'top', width: '5%'}],
    ['type', {name: 'T', type: 'text', vAlign: 'top', width: '5%'}],
    ['line', {name: 'line', type: 'text', vAlign: 'top', width: '5%'}],
    ['column', {name: 'column', type: 'text', vAlign: 'top', width: '5%'}],
    ['length', {name: 'length', type: 'text', vAlign: 'top', width: '5%'}],
    ['msg', {name: 'message', type: 'text'}]
  ]);
  let problemListHandleOut: ListViewHandleOut | undefined = $state();

  function onLint(d: EmmmDiagnostic[]) {
    problemListHandleOut?.reset(d.map((x) => {
      const source = x.location.source;
      return {
        cols: {
          type: {type: 'text', content: {
            warning: '⚠️',
            error: '❌',
            hint: '💡',
            info: 'ℹ️'
          }[x.severity]},
          file: {type: 'text', content: source.name},
          line: {type: 'text', content: `${source.getRowCol(x.from)[0] + 1}`},
          column: {type: 'text', content: `${source.getRowCol(x.from)[1] + 1}`},
          length: {type: 'text', content: `${x.to - x.from}`},
          msg: {type: 'text', content: x.message},
        }
      };
    }));
  }
</script>

<div class="vlayout fill">

<!-- main area -->
<div class="hlayout flexgrow">

<!-- tools view -->
<div class="pane" style="width: 300px;" bind:this={left}>
  <TabView>
    <TabPage name='Document'>
      <SyncToolbox />
    </TabPage>
    <TabPage name='Weixin'>
      <WeixinToolbox />
    </TabPage>
    <TabPage name="Parameters">
      <ParametersToolbox />
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
          provideContext={() => libConfig
            ? new emmm.ParseContext(emmm.Configuration.from(libConfig, true))
            : undefined
          }
          {onLint}
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
    <TabPage name="Library"
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
    <TabPage name="Stylesheet">
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
    <TabPage name="AST" removeIfInactive={true}>
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
