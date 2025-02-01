<script lang="ts">
  import * as emmm from '@the_dissidents/libemmm';
  import Editor from './Editor.svelte';
  import Resizer from './ui/Resizer.svelte';

  let output: HTMLTextAreaElement;
  let left = $state<HTMLElement>(), right = $state<HTMLElement>();
  let status = $state('ok');
  let strip = $state(false);
  let doc: emmm.Document | undefined = $state(undefined);

  let source: string = ``;

  function onchange(src: string) {
    source = src;
  }
  
  $effect(() => {
    if (!doc) return;
    let newDoc = strip ? doc.toStripped() : doc;
    output.value = emmm.debugPrint.document(newDoc, source);
  });
</script>

<div class="hlayout flexgrow">
  <div class="pane flexgrow" bind:this={left}>
    <Editor onparse={(x) => {doc = x;}} onchange={onchange} />
  </div>
  <Resizer first={left} second={right} vertical={true} reverse={true}/>
  <div class="pane vlayout" bind:this={right}>
    <textarea class="fill"
      bind:this={output}></textarea>
    <span>{status}</span>
    <label>
      <input type="checkbox" bind:checked={strip} />
      only show transformed (stripped) AST
    </label>
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
</style>
