<script lang="ts">
  import { ChangeSet, EditorSelection, type ChangeSpec } from "@codemirror/state";
  import type { Selection } from "$lib/editor/Editor.svelte";
  import { Interface } from "../Interface.svelte";
  import { Debug } from "../Debug";
  import { EditorView } from "@codemirror/view";
  import { Memorized } from "$lib/config/Memorized.svelte";
  import * as z from "zod/v4-mini";
  import { getReplacement } from "$lib/details/Replace";

  let searchPattern = $state('');
  let replacement = $state('');
  let useRegex = Memorized.$('search-useRegex', z.boolean(), true);
  let useEscape = Memorized.$('search-useEscape', z.boolean(), true);
  let caseSensitive = Memorized.$('search-caseSensitive', z.boolean(), true);

  function escapeRegexp(str: string) {
      return str.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
  }

  function work(action: 'select' | 'replace', all: boolean, start?: number) {
    if (!Interface.activeEditor) {
      return Debug.early('no activeEditor');
    }

    if (searchPattern === '') {
      Interface.status.set('search pattern is empty!');
      return;
    }

    start ??= all ? 0 : Interface.activeEditor.getSelections().at(0)?.to ?? 0;

    const pattern = new RegExp(
      $useRegex ? searchPattern : escapeRegexp(searchPattern),
      'ug' + ($caseSensitive ? '' : 'i'));
    const text = Interface.activeEditor.getText();
    const textSliced = text.slice(start);

    const ranges: Selection[] = [];
    const changes: ChangeSpec[] = [];
    for (const match of textSliced.matchAll(pattern)) {
      const from = match.index + start;
      const to = from + match[0].length;
      ranges.push({ from, to });
      if (action == 'replace') {
        const insert = $useEscape ? getReplacement(match, replacement) : replacement;
        changes.push({ from, to, insert });
      }
      if (!all) break;
    }

    if (ranges.length > 0) {
      Interface.activeEditor.setSelections(ranges);
      if (ranges.length == 1) {
        Interface.activeEditor.update({
          effects: EditorView.scrollIntoView(
            EditorSelection.range(ranges[0].from, ranges[0].to), { y: 'center' })
        });
      }
    }
    if (changes.length > 0) {
      Interface.status.set(
        `replaced ${changes.length} occurrence${changes.length !== 1 ? 's' : ''}`);
      Interface.activeEditor.update({
        changes: ChangeSet.of(changes, text.length)
      });
    } else if (ranges.length > 0) {
      Interface.status.set(
        `found ${ranges.length} occurrence${ranges.length !== 1 ? 's' : ''}`);
    } else if (start > 0) {
      work(action, all, 0);
    } else {
      Interface.status.set(`found nothing`);
      Interface.activeEditor.setSelections([]);
    }
    Interface.activeEditor.focus();
  }
</script>

<div class="vlayout contain">

<h5>Search & Replace</h5>

<input type="text" placeholder="pattern" bind:value={searchPattern} />
<input type="text" placeholder="replace by" bind:value={replacement} />

<label>
  <input type="checkbox" bind:checked={$caseSensitive} />
  case sensitive
</label>

<label>
  <input type="checkbox" bind:checked={$useRegex} />
  use regex
</label>

<label>
  <input type="checkbox" bind:checked={$useEscape} />
  use escape characters in replacement expression
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
