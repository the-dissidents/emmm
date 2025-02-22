<script lang="ts">
  import * as emmm from '@the_dissidents/libemmm';
  import Editor from './Editor.svelte';
  import Resizer from './ui/Resizer.svelte';
  import TabView from './ui/TabView.svelte';
  import TabPage from './ui/TabPage.svelte';

  let outputAST = $state('');
  let renderedHTML = $state('');
  let left = $state<HTMLElement>(), right = $state<HTMLElement>();
  let status = $state('ok');
  let strip = $state(false);
  let doc: emmm.Document | undefined = $state(undefined);

  let source: string = ``;

  function onchange(src: string) {
    source = src;
  }

  function onparse(doc: emmm.Document) {
    let newDoc = strip ? doc.toStripped() : doc;
    outputAST = emmm.debugPrint.document(newDoc, source);
    let renderConfig = emmm.HTMLRenderConfiguration;
    let state = new emmm.HTMLRenderState();
    state.stylesheet = `
body {
    font-family: system-ui, sans-serif;
    background-color: white;
    line-height: 1.4;
}
sup {
  line-height: 0;
}
details.invalid {
    border-radius: 3px;
    padding: 5px;
    font-size: 80%;
    border: 1px black;
    background-color: darkred;
    color: white;
}
span.invalid {
    border-radius: 3px;
    padding: 2px 4px;
    font-size: 80%;
    border: 1px black;
    background-color: darkred;
    color: white;
}
p {
    margin-block: 0 1em;
}
.note.invalid {
    color: red;
}
td.note-name {
    padding-right: 5px;
    vertical-align: text-top;
    text-align: end;
}
p.attribution {
    text-align: end;
}
span code {
    background-color: #eee;
    padding: 2px 4px;
    margin: 0 2px;
    border-radius: 3px;
}
span.commentary {
    font-size: 80%;
    color: gray;
}
`;
    renderedHTML = renderConfig.render(doc, state);
  }
</script>

<div class="hlayout flexgrow">
  <div class="pane flexgrow" bind:this={left}>
    <Editor onparse={onparse} onchange={onchange} />
  </div>
  <Resizer first={left} second={right} vertical={true} reverse={true} />
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
