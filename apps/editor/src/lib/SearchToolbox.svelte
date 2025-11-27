<script lang="ts">
  import { ChangeSet, type ChangeSpec } from "@codemirror/state";
  import type { Selection } from "./Editor.svelte";
  import { Interface } from "./Interface.svelte";
  import { Debug } from "./Debug";

  let searchPattern = $state('');
  let replacement = $state('');
  let useRegex = $state(true);

  function escapeRegexp(str: string) {
      return str.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
  }

  function work(action: 'select' | 'replace', all: boolean) {
    if (!Interface.activeEditor) {
      return Debug.early('no activeEditor');
    }

    const pattern = new RegExp(useRegex ? searchPattern : escapeRegexp(searchPattern), 'ug');
    const startPos = 
      all ? 0 : Interface.activeEditor.getSelections().at(-1)?.to ?? 0;
    const text = Interface.activeEditor.getText();
    const textSliced = text.slice(startPos);
    
    const ranges: Selection[] = [];
    const changes: ChangeSpec[] = [];
    for (const match of textSliced.matchAll(pattern)) {
      const from = match.index + startPos;
      const to = from + match.length;
      ranges.push({ from, to });
      if (action == 'replace') {
        changes.push({ from, to, insert: replacement });
      }
      if (!all) break;
    }

    if (ranges.length > 0) {
      Interface.activeEditor.setSelections(ranges);
    }
    if (changes.length > 0) {
      Interface.activeEditor.update({
        changes: ChangeSet.of(changes, text.length)
      });
    }
    Interface.activeEditor.focus();
  }
</script>

<div class="vlayout contain">

<h5>Search & Replace</h5>

<input type="text" placeholder="pattern" bind:value={searchPattern} />
<input type="text" placeholder="replace by" bind:value={replacement} />

<label>
  <input type="checkbox" bind:checked={useRegex} />
  use regex
</label>

<div class="hlayout">
  <button onclick={() => work('select', false)}>Find next</button>
  <button onclick={() => work('select', true)}>Find all</button>
</div>

<div class="hlayout">
  <button onclick={() => work('replace', false)}>Replace next</button>
  <button onclick={() => work('replace', true)}>Replace all</button>
</div>

</div>