<script lang="ts">
  import { Memorized } from "$lib/config/Memorized.svelte";
  import { Interface } from "$lib/Interface.svelte";
  import { Workspace } from "$lib/workspace/Workspace.svelte";
  import { fetch } from "@tauri-apps/plugin-http";
  import * as z from "zod/v4-mini";

  import * as dialog from '@tauri-apps/plugin-dialog';
  import { RustAPI } from "$lib/RustAPI";
  import { htmlToEmmm } from "$lib/integration/weixin/Importer";
  import { openPath } from "@tauri-apps/plugin-opener";
  import { appConfigDir, appLocalDataDir, appLogDir } from "@tauri-apps/api/path";
  import { compileStyles } from "$lib/Render";
  import { _ } from 'svelte-i18n';
  import { EditableDocument, EmmmDocument, MovableDocument } from "$lib/workspace/Document.svelte";
  import { FilePlusIcon, FolderOpenIcon, SaveIcon, SavePlusIcon } from "@lucide/svelte";
  import { Tooltip } from "@the_dissidents/svelte-ui";

  let progress = Interface.progress;

  const libraryUrl = Memorized.$('librarySyncUrl', z.string(), 'https://raw.githubusercontent.com/the-dissidents/emmm/refs/heads/main/apps/editor/src/template/testlib.txt');

  const stylesUrl = Memorized.$('stylesSyncUrl', z.string(), 'https://raw.githubusercontent.com/the-dissidents/emmm/refs/heads/main/apps/editor/src/template/stylesheet.scss');

  function newDocument() {
    Workspace.newDocument();
  }

  async function openDocument() {
    try {
      await Workspace.openDialog();
    } catch (e) {
      Interface.status.set($_('file.msg.error-open', { values: { error: String(e) } }));
    }
  }

  async function saveActive() {
    const doc = Workspace.active;
    if (!doc) return;
    try {
      if (await doc.save())
        Interface.status.set($_('file.msg.saved', { values: { path: doc.path ?? doc.name } }));
    } catch (e) {
      Interface.status.set($_('file.msg.error-save', { values: { error: String(e) } }));
    }
  }

  async function saveAsActive() {
    const doc = Workspace.active;
    if (!(doc instanceof MovableDocument)) return;
    try {
      if (await doc.saveAs())
        Interface.status.set($_('file.msg.saved', { values: { path: doc.path ?? doc.name } }));
    } catch (e) {
      Interface.status.set($_('file.msg.error-save', { values: { error: String(e) } }));
    }
  }

  async function insertFromClipboard() {
    let result: string | undefined;
    for (const item of await navigator.clipboard.read()) {
      if (item.types.includes('text/html')) {
        const html = await (await item.getType('text/html')).text();
        result = htmlToEmmm(html);
        break;
      }
    }
    if (!result) {
      await dialog.message($_('sync.no-html'), { kind: 'error' });
      return;
    }

    const doc = Workspace.active;
    if (!(doc instanceof EditableDocument)) return;
    const loc = doc.editor?.getSelections().at(0);
    doc.editor?.update({
      changes: {
        from: loc?.from ?? 0,
        to: loc?.to ?? 0,
        insert: result
      }
    });
  }

  async function updateAll() {
    const total = ($libraryUrl ? 1 : 0) + ($stylesUrl ? 1 : 0);
    if (total == 0) {
      Interface.status.set($_('sync.msg.no-sync-url'));
      return;
    }

    $progress = 0;
    if ($libraryUrl) {
      try {
        Workspace.library.source = await (await fetch($libraryUrl)).text();
        Workspace.library.dirty = true;
      } catch (e) {
        await dialog.message($_('sync.msg.error-updating-library', { values: { error: String(e) } }), { kind: 'error' });
      }
      $progress += 1 / total;
    }

    if ($stylesUrl) {
      try {
        Workspace.stylesheet.source = await (await fetch($stylesUrl)).text();
        Workspace.stylesheet.dirty = true;
      } catch (e) {
        await dialog.message($_('sync.msg.error-updating-stylesheet', { values: { error: String(e) } }), { kind: 'error' });
      }
      $progress += 1 / total;
    }

    Interface.status.set($_('sync.msg.updated'));
    $progress = undefined;
  }

  async function archive() {
    const doc = Workspace.active;
    if (!(doc instanceof EmmmDocument)) return;

    const path = await dialog.save({
      filters: [{ name: $_('sync.archive-filter'), extensions: ['zip'] }],
      title: $_('sync.save-path')
    });
    if (path === null) return;

    try {
      $progress = 0;
      await RustAPI.archive(doc.source, path, (x) => $progress = x);
      Interface.status.set($_('sync.msg.archived', { values: { path } }));
    } catch (e) {
      Interface.status.set($_('sync.msg.error-archiving', { values: { error: String(e) } }));
    } finally {
      $progress = undefined;
    }
  }

  async function unarchive() {
    const path = await dialog.open({
      filters: [{ name: $_('sync.archive-filter'), extensions: ['zip'] }],
      title: $_('sync.archive-path')
    });
    if (path === null) return;

    const assetFolder = await dialog.open({
      directory: true,
      title: $_('sync.extract-assets-to'),
    });
    if (assetFolder === null) return;

    try {
      $progress = 0;
      const source = await RustAPI.unarchive(path, assetFolder, (x) => $progress = x);
      const doc = Workspace.newDocument(source);
      doc.dirty = true;
      Interface.status.set($_('sync.msg.extracted', { values: { path: assetFolder } }));
    } catch (e) {
      Interface.status.set($_('sync.msg.error-unarchiving', { values: { error: String(e) } }));
    } finally {
      $progress = undefined;
    }
  }
</script>

<h5>{$_('tab.file')}</h5>
<Tooltip text={$_('file.new')}>
  <button class="veryimportant" onclick={newDocument}>
    <FilePlusIcon />
  </button>
</Tooltip>

<Tooltip text={$_('file.open')}>
  <button class="veryimportant" onclick={openDocument}>
    <FolderOpenIcon />
  </button>
</Tooltip>

<Tooltip text={$_('file.save')}>
  <button class="veryimportant"
    disabled={!Workspace.active?.path}
    onclick={saveActive}
  ><SaveIcon /></button>
</Tooltip>

<Tooltip text={$_('file.save-as')}>
  <button class="veryimportant"
    disabled={!(Workspace.active instanceof MovableDocument)}
    onclick={saveAsActive}
  ><SavePlusIcon /></button>
</Tooltip>

<button onclick={() => Memorized.save()}>{$_('file.save-system-config')}</button>

<h5>{$_('sync.title')}</h5>
<table class="config"><tbody>
  <tr>
    <td>{$_('sync.library')}</td>
    <td class='hlayout'>
      <input type="text" class="flexgrow" bind:value={$libraryUrl} />
    </td>
  </tr>
  <tr>
    <td>{$_('sync.stylesheet')}</td>
    <td class='hlayout'>
      <input type="text" class="flexgrow" bind:value={$stylesUrl} />
    </td>
  </tr>
</tbody></table>

<button class="important" onclick={() => {
  Workspace.openDocument(Workspace.library);
}}>{$_('sync.edit-library')}</button>
<button class="important" onclick={() => {
  Workspace.openDocument(Workspace.stylesheet);
}}>{$_('sync.edit-stylesheet')}</button>
<button class="veryimportant" onclick={updateAll}>
  {$_('sync.update-all')}
</button>

<h5>{$_('sync.archive-title')}</h5>
<button class="veryimportant" onclick={archive}>{$_('sync.save-archive')}</button>
<button class="important" onclick={unarchive}>{$_('sync.import-archive')}</button>

<h5>{$_('sync.external-sources')}</h5>
<button class='veryimportant'
  disabled={!Workspace.active}
  onclick={insertFromClipboard}
>{$_('sync.insert-from-clipboard')}</button>

<h5>{$_('sync.debug')}</h5>

<button onclick={async () => {
  console.log(await appLogDir());
  openPath(await appLogDir());
}}>{$_('sync.open-log-folder')}</button>

<button onclick={async () => {
  console.log(await appConfigDir());
  openPath(await appConfigDir());
}}>{$_('sync.open-config-folder')}</button>

<button onclick={async () => {
  console.log(await appLocalDataDir());
  openPath(await appLocalDataDir());
}}>{$_('sync.open-autosave-folder')}</button>

<button onclick={async () => {
  const result = await compileStyles({
    sass: Workspace.stylesheet.source,
    colors: Interface.colors.get(),
    backgroundImage: Interface.backgroundImage.get()
  });
  console.log(result);
}}>
  {$_('sync.sass')}
</button>
