<script lang="ts">
  import * as emmm from '@the_dissidents/libemmm';
  import Editor from './Editor.svelte';
  import Resizer from './ui/Resizer.svelte';

  let output: HTMLTextAreaElement;
  let left = $state<HTMLElement>(), right = $state<HTMLElement>();
  let status = $state('ok');

  let source: string = ``;

  function onchange(src: string) {
    source = src;
  }

  function test(doc: emmm.Document) {
    output.value = doc.debugPrint(source);
  }
</script>

<div class="hlayout flexgrow">
  <div class="pane flexgrow" bind:this={left}>
    <Editor onparse={test} onchange={onchange} />
  </div>
  <Resizer first={left} second={right} vertical={true} reverse={true}/>
  <div class="pane vlayout" bind:this={right}>
    <textarea class="fill"
      bind:this={output}></textarea>
    <p>{status}</p>
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
