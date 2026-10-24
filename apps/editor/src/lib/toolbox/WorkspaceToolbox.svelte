<script lang="ts">
  import * as fs from "@tauri-apps/plugin-fs";
  import * as dialog from '@tauri-apps/plugin-dialog';
  import * as path from '@tauri-apps/api/path';
  import * as z from 'zod/v4-mini';

  import { Tooltip, TreeButtonItem, TreeView, type TreeViewItem } from '@the_dissidents/svelte-ui'
  import { Memorized } from "$lib/config/Memorized.svelte";
  import { CogIcon, FileImageIcon, FileTextIcon, FolderOpenIcon, LibraryBigIcon, PaletteIcon, SaveIcon } from "@lucide/svelte";
  import { Workspace } from "$lib/workspace/Workspace.svelte";
  import { _ } from 'svelte-i18n';
  import { revealItemInDir } from "@tauri-apps/plugin-opener";
  import { menu } from "@tauri-apps/api";
  import { platform } from "@tauri-apps/plugin-os";
  import { EditableDocument } from "$lib/workspace/Document.svelte";
  import { Debug } from "$lib/Debug";

  let showHidden = Memorized.$('showHidden', z.boolean(), false);
  const assetExts = /\.(jpg|jpeg|png|gif|webp|svg|tiff)$/;

  type Leaf = {
    name: string,
    type: 'document' | 'asset' | 'config' | 'library' | 'stylesheet'
  };
  type Node = {
    name: string
  };

  type Item = TreeViewItem<Leaf, Node>;

  let treeView = $state<TreeView<Leaf, Node>>();
  let selectedId = $state<string | null>(null);

  const me = {};
  let unwatch: (() => void) | undefined;
  Workspace.onWorkspaceChanged.bind(me, async () => {
    unwatch?.();
    if (!Workspace.path) return;

    unwatch = await fs.watch(Workspace.path, async (e) => {
      if (typeof e.type !== 'object') return;

      const docs = Workspace.documents.filter((x) => x instanceof EditableDocument
          && x.path && e.paths.includes(x.path)) as EditableDocument[];
      let modified = false;

      if ('create' in e.type || 'remove' in e.type) {
        // update
        treeView?.reload();
        if ('remove' in e.type)
          modified = true;
      } else if ('modify' in e.type) {
        const kind = e.type.modify.kind;
        if (kind == 'rename') {
          // update
          treeView?.reload();
        }
        if (kind == 'rename' || kind == 'data')
          modified = true;
      }
      if (modified && docs.length > 0) {
        for (const doc of docs) {
          Debug.assert(!!doc.path);
          doc.externallyModified = false;

          if (!await fs.exists(doc.path) || !(await fs.stat(doc.path)).isFile)
            doc.externallyModified = 'move';
          else {
            const content = await fs.readTextFile(doc.path);
            if (content !== doc.source)
              doc.externallyModified = 'data';
          }

          if (doc.externallyModified)
            doc.dirty = true;
        }
        console.log(e);
      }
    }, { delayMs: 500, recursive: true });
  });
  Workspace.onActiveDocumentChanged.bind(me, () => {
    if (Workspace.active?.path)
      selectedId = Workspace.active.path;
  });

  function getOrdering(a: Item): number {
    if (!a.leaf) return 0;
    if (a.data.type == 'config') return 1;
    if (a.data.type == 'library') return 1.1;
    if (a.data.type == 'stylesheet') return 1.2;
    if (a.data.type == 'document') return 3;
    if (a.data.type == 'asset') return 4;
    return a.data.type satisfies never;
  }

  async function askOpenWorkspace() {
    const value = await dialog.open({
      directory: true
    });
    if (!value) return;
    await Workspace.open(value);
  }

  function editDocument(data: Leaf, key: string) {
    switch (data.type) {
      case 'document':
        Workspace.openDocumentPath(key);
        break;
      case 'library':
        Workspace.openDocument(Workspace.library);
        break;
      case 'stylesheet':
        Workspace.openDocument(Workspace.stylesheet);
        break;
      case 'config':
        Workspace.openDocument(Workspace.config);
        break;
    }
  }

  async function contextMenu(data: Leaf, key: string) {
    (await menu.Menu.new({ items: [
      {
        text: $_('workspace.file.edit'),
        action: () => editDocument(data, key)
      }, {
        item: 'Separator'
      }, {
        text: platform() == 'macos'
          ? $_('workspace.file.reveal-in-finder')
          : $_('workspace.file.reveal-in-explorer'),
        action: () => revealItemInDir(key)
      }
    ] })).popup();
  }
</script>

<div class="container">

{#if Workspace.path}
  <div class="opened">
    <span>{$_('workspace.workspace')}</span>
    <div class="row">
      <code>{Workspace.name ?? $_('workspace.untitled')}</code>
      <Tooltip text={$_('workspace.settings')}>
        <button onclick={() => Workspace.openDocument(Workspace.config)}>
          <CogIcon />
        </button>
      </Tooltip>
      <Tooltip text={$_('workspace.save')}>
        <button onclick={() => Workspace.config.save()}>
          <SaveIcon />
        </button>
      </Tooltip>
      <Tooltip text={$_('workspace.open-new')}>
        <button onclick={askOpenWorkspace}>
          <FolderOpenIcon />
        </button>
      </Tooltip>
    </div>
  </div>

  <TreeView bind:this={treeView}
    getItems={async (item): Promise<Item[]> => {
      const base = item?.key ?? Workspace.path;
      if (!base) return [];
      const items: Item[] = [];

      for (const x of await fs.readDir(base)) {
        if (!$showHidden && x.name.startsWith('.')) continue;
        if (x.isDirectory)
          items.push({ key: await path.join(base, x.name), leaf: false, data: { name: x.name } });
        if (x.isFile) {
          const key = await path.join(base, x.name), leaf = true;
          if (!item && x.name === 'lib.emmm')
            items.push({ key, leaf, data: { name: x.name, type: 'library' } });
          else if (!item && x.name === 'emmm-workspace.json')
            items.push({ key, leaf, data: { name: x.name, type: 'config' } });
          else if (!item && x.name === 'style.scss')
            items.push({ key, leaf, data: { name: x.name, type: 'stylesheet' } });
          else if (x.name.endsWith('.emmm'))
            items.push({ key, leaf, data: { name: x.name, type: 'document' } });
          else if (assetExts.test(x.name))
            items.push({ key, leaf, data: { name: x.name, type: 'asset' } });
        }
      }
      return items.sort((a, b) => {
        return getOrdering(a) - getOrdering(b)
            || a.data.name.localeCompare(b.data.name);
      });
    }}
    style="flex-grow: 1;"
    bind:selected={selectedId}
  >
    {#snippet leaf({data, key})}
      <TreeButtonItem onmouseup={(e) => {
        if (e.button == 0)
          editDocument(data, key);
      }} oncontextmenu={(e) => {
        e.preventDefault();
        void contextMenu(data, key);
      }}>
        <span class="icon">
          {#if data.type == 'document'}
          <FileTextIcon />
          {:else if data.type == 'asset'}
          <FileImageIcon />
          {:else if data.type == 'library'}
          <LibraryBigIcon />
          {:else if data.type == 'config'}
          <CogIcon />
          {:else if data.type == 'stylesheet'}
          <PaletteIcon />
          {/if}
        </span>
        <span class="name">{data.name}</span>
      </TreeButtonItem>
    {/snippet}
    {#snippet node({data})}
      {data.name}
    {/snippet}
  </TreeView>

{:else}
  <div class="empty">
    <hr>
    <div class="note">{$_('workspace.no-workspace-opened')}</div>
    <button onclick={askOpenWorkspace}>
      {$_('workspace.open-folder')}
    </button>
    <hr>
  </div>
{/if}

</div>

<style>
  .container {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .opened {
    display: flex;
    flex-direction: row;
    font-size: 0.9rem;
    gap: 5px;
    padding: 3px;

    code {
      font-weight: bold;
      margin-right: 5px;
      flex-grow: 1;
    }

    .row {
      display: flex;
      flex-direction: row;
      flex-wrap: wrap;
      align-items: center;
      flex-grow: 1;
    }
  }

  .icon {
    margin-right: 3px;
  }

  .name {
    flex-grow: 1;

    /* white-space: nowrap; */
    overflow: hidden;
    /* overflow: scroll; */
    text-overflow: ellipsis;
  }

  .empty {
    flex-grow: 1;

    display: flex;
    flex-direction: column;
    align-items: center;

    hr {
      flex-grow: 1;
    }

    .note {
      font-weight: bold;
      margin-bottom: 1em;
    }
  }
</style>
