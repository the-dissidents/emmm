<script lang="ts">
  import { Memorized } from "$lib/config/Memorized.svelte";
  import { Interface } from "$lib/Interface.svelte";
  import { fetch } from "@tauri-apps/plugin-http";
  import * as z from "zod/v4-mini";

  import * as dialog from '@tauri-apps/plugin-dialog';

  const libraryUrl = Memorized.$('librarySyncUrl', z.string(), 'https://raw.githubusercontent.com/the-dissidents/emmm/refs/heads/main/apps/editor/src/template/testlib.txt');

  const cssUrl = Memorized.$('cssSyncUrl', z.string(), 'https://raw.githubusercontent.com/the-dissidents/emmm/refs/heads/main/apps/editor/src/template/typesetting.css');

  async function updateAll() {
    if ($libraryUrl) {
      try {
        Interface.library.set(await (await fetch($libraryUrl)).text());
      } catch (e) {
        await dialog.message(`error updating library: ${e}`, { kind: 'error' });
      }
    }

    if ($cssUrl) {
      try {
        Interface.stylesheet.set(await (await fetch($cssUrl)).text());
      } catch (e) {
        await dialog.message(`error updating stylesheet: ${e}`, { kind: 'error' });
      }
    }

    Interface.status.set('updated');
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
  <tr>
    <td colspan="2"><button onclick={updateAll}>Update all</button></td>
  </tr>
</tbody></table>

<style>
  button {
    width: 100%;
  }
</style>
