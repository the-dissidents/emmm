<script lang="ts">
  import { Memorized } from "$lib/config/Memorized.svelte";
  import { Interface } from "$lib/Interface.svelte";
  import { fetch } from "@tauri-apps/plugin-http";
  import * as z from "zod/v4-mini";

  import * as dialog from '@tauri-apps/plugin-dialog';
  import { RustAPI } from "$lib/RustAPI";

  let progress = Interface.progress;

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
<button onclick={updateAll}>Update all</button>
<h5>Archive</h5>
<button onclick={archive}>Save as archive</button>
<button onclick={unarchive}>Import archive</button>

<style>
  button {
    width: 100%;
  }
</style>
