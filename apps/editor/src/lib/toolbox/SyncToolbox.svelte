<script lang="ts">
  import { Memorized } from "$lib/config/Memorized.svelte";
  import { defaultSource, Interface } from "$lib/Interface.svelte";
  import { fetch } from "@tauri-apps/plugin-http";
  import * as z from "zod/v4-mini";

  import * as dialog from '@tauri-apps/plugin-dialog';
  import { RustAPI } from "$lib/RustAPI";
  import { htmlToEmmm } from "$lib/integration/weixin/Importer";

  let progress = Interface.progress;
  let pasteBehavior = Interface.pasteBehavior;

  const libraryUrl = Memorized.$('librarySyncUrl', z.string(), 'https://raw.githubusercontent.com/the-dissidents/emmm/refs/heads/main/apps/editor/src/template/testlib.txt');

  const cssUrl = Memorized.$('cssSyncUrl', z.string(), 'https://raw.githubusercontent.com/the-dissidents/emmm/refs/heads/main/apps/editor/src/template/typesetting.css');

  async function updateAll() {
    const total = ($libraryUrl ? 1 : 0) + ($cssUrl ? 1 : 0);
    if (total == 0) {
      Interface.status.set('no sync URL provided');
      return;
    }

    $progress = 0;
    if ($libraryUrl) {
      try {
        Interface.library.set(await (await fetch($libraryUrl)).text());
      } catch (e) {
        await dialog.message(`error updating library: ${e}`, { kind: 'error' });
      }
      $progress += 1 / total;
    }

    if ($cssUrl) {
      try {
        Interface.stylesheet.set(await (await fetch($cssUrl)).text());
      } catch (e) {
        await dialog.message(`error updating stylesheet: ${e}`, { kind: 'error' });
      }
      $progress += 1 / total;
    }

    Interface.status.set('updated');
    $progress = undefined;
  }

  async function archive() {
    const path = await dialog.save({
      filters: [{ name: 'Archive', extensions: ['zip'] }],
      title: 'save path'
    });
    if (path === null) return;

    try {
      $progress = 0;
      await RustAPI.archive(Interface.source.get(), path, (x) => $progress = x);
      Interface.status.set(`archived to ${path}`);
    } catch (e) {
      Interface.status.set(`error when archiving: ${e}`);
    } finally {
      $progress = undefined;
    }
  }

  async function unarchive() {
    const path = await dialog.open({
      filters: [{ name: 'Archive', extensions: ['zip'] }],
      title: 'archive path'
    });
    if (path === null) return;

    const assetFolder = await dialog.open({
      directory: true,
      title: 'extract assets to',
    });
    if (assetFolder === null) return;

    try {
      $progress = 0;
      Interface.source.set(await RustAPI.unarchive(path, assetFolder, (x) => $progress = x));
      Interface.status.set(`extracted assets from archive to ${assetFolder}`);
    } catch (e) {
      Interface.status.set(`error when unarchiving: ${e}`);
    } finally {
      $progress = undefined;
    }
  }
</script>

<h5>Synchronization</h5>
<table class="config"><tbody>
  <tr>
    <td>library</td>
    <td class='hlayout'>
      <input type="text" class="flexgrow" bind:value={$libraryUrl} />
    </td>
  </tr>
  <tr>
    <td>stylesheet</td>
    <td class='hlayout'>
      <input type="text" class="flexgrow" bind:value={$cssUrl} />
    </td>
  </tr>
</tbody></table>
<button class="veryimportant" onclick={updateAll}>Update all</button>
<h5>Archive</h5>
<button class="veryimportant" onclick={archive}>Save as archive</button>
<button class="important" onclick={unarchive}>Import archive</button>

<!-- <h5>Pasting behavior</h5>

<div class="vlayout">

<label>
  <input type="radio" bind:group={$pasteBehavior} value={"html"}>
  automatically recognize formatting
</label>

<label>
  <input type="radio" bind:group={$pasteBehavior} value={"plain"}>
  paste as plain source text
</label>

</div> -->

<h5>External sources</h5>
<button class='veryimportant'
  disabled={Interface.sourceEditor !== Interface.activeEditor}
  onclick={async () => {
    let result: string | undefined;
    for (const item of await navigator.clipboard.read()) {
      if (item.types.includes('text/html')) {
        const html = await (await item.getType('text/html')).text();
        result = htmlToEmmm(html);
        break;
      }
    }
    if (!result) {
      await dialog.message('No HTML found in the clipboard', { kind: 'error' });
      return;
    }

    const loc = Interface.sourceEditor?.getSelections().at(0);

    Interface.sourceEditor?.update({
      changes: {
        from: loc?.from ?? 0,
        to: loc?.to ?? 0,
        insert: result
      }
    });
  }}
>Insert from clipboard</button>

<button class='important'
  onclick={async () => {
    if (!await dialog.confirm('Are you sure to clear any current existing document?'))
      return;
    Interface.source.set(defaultSource);
    Interface.sourceEditor?.focus();
  }}
>Start a new document</button>

<style>
  button {

  }
</style>
