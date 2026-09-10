<script lang="ts">
  import { ChangeSet, EditorSelection, type ChangeSpec } from "@codemirror/state";
  import type { Selection } from "$lib/editor/Editor.svelte";
  import { Interface } from "../Interface.svelte";
  import { Workspace } from "$lib/workspace/Workspace.svelte";
  import { EditorView } from "@codemirror/view";
  import { Memorized } from "$lib/config/Memorized.svelte";
  import * as z from "zod/v4-mini";
  import { getReplacement } from "$lib/details/Replace";
  import { _ } from 'svelte-i18n';

  let searchPattern = $state('');
  let replacement = $state('');
  let useRegex = Memorized.$('search-useRegex', z.boolean(), true);
  let useEscape = Memorized.$('search-useEscape', z.boolean(), true);
  let caseSensitive = Memorized.$('search-caseSensitive', z.boolean(), true);

  function escapeRegexp(str: string) {
      return str.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
  }

  function work(action: 'select' | 'replace', all: boolean, start?: number) {
    const editor = Workspace.active?.editor;
    if (!editor) return;

    if (searchPattern === '') {
      Interface.status.set($_('search.msg.empty'));
      return;
    }

    start ??= all ? 0 : editor.getSelections().at(0)?.to ?? 0;

    const pattern = new RegExp(
      $useRegex ? searchPattern : escapeRegexp(searchPattern),
      'ug' + ($caseSensitive ? '' : 'i'));
    const text = editor.getText();
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
      editor.setSelections(ranges);
      if (ranges.length == 1) {
        editor.update({
          effects: EditorView.scrollIntoView(
            EditorSelection.range(ranges[0].from, ranges[0].to), { y: 'center' })
        });
      }
    }
    if (changes.length > 0) {
      Interface.status.set(
        $_('search.msg.replaced', { values: { count: changes.length, s: changes.length !== 1 ? 's' : '' } }));
      editor.update({
        changes: ChangeSet.of(changes, text.length)
      });
    } else if (ranges.length > 0) {
      Interface.status.set(
        $_('search.msg.found', { values: { count: ranges.length, s: ranges.length !== 1 ? 's' : '' } }));
    } else if (start > 0) {
      work(action, all, 0);
    } else {
      Interface.status.set($_('search.msg.nothing'));
      editor.setSelections([]);
    }
    editor.focus();
  }
</script>

<div class="vlayout vfill">

<h5>{$_('search.title')}</h5>

<input type="text" placeholder={$_('search.pattern')} bind:value={searchPattern} />
<input type="text" placeholder={$_('search.replacement')} bind:value={replacement} />

<label>
  <input type="checkbox" bind:checked={$caseSensitive} />
  {$_('search.case-sensitive')}
</label>

<label>
  <input type="checkbox" bind:checked={$useRegex} />
  {$_('search.use-regex')}
</label>

<label>
  <input type="checkbox" bind:checked={$useEscape} />
  {$_('search.use-escape')}
</label>

<div class="hlayout">
  <button onclick={() => work('select', false)}>{$_('search.find-next')}</button>
  <button onclick={() => work('select', true)}>{$_('search.find-all')}</button>
</div>

<div class="hlayout">
  <button onclick={() => work('replace', false)}>{$_('search.replace-next')}</button>
  <button onclick={() => work('replace', true)}>{$_('search.replace-all')}</button>
</div>

</div>
