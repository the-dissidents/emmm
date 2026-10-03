<script lang="ts">
  import * as fs from '@tauri-apps/plugin-fs';
  import * as dialog from '@tauri-apps/plugin-dialog';
  import * as path from '@tauri-apps/api/path';
  import * as z from 'zod/v4-mini';

  import {
    TreeButtonItem,
    TreeView,
    type TreeViewItem,
    type TreeViewNodeItem,
  } from '@the_dissidents/svelte-ui';
  import { Memorized } from '$lib/config/Memorized.svelte';
  import {
    CogIcon,
    FileImageIcon,
    FileTextIcon,
    FolderOpenIcon,
    LibraryBigIcon,
    PaletteIcon,
    SaveIcon,
  } from '@lucide/svelte';
  import { Workspace } from '$lib/workspace/Workspace.svelte';
  import { _ } from 'svelte-i18n';

  let showHidden = Memorized.$('showHidden', z.boolean(), false);
  const assetExts = /\.(jpg|jpeg|png|gif|webp|svg|tiff)$/;

  type Leaf = {
    name: string;
    type: 'document' | 'asset' | 'config' | 'library' | 'stylesheet';
  };
  type Node = {
    name: string;
  };

  type Item = TreeViewItem<Leaf, Node>;

  let treeRevision = $state(0);
  let selectedId = $state<string | null>(null);

  const me = {};
  let unwatch: (() => void) | undefined;
  Workspace.onWorkspaceChanged.bind(me, async () => {
    if (unwatch) unwatch();
    if (!Workspace.path) return;

    unwatch = await fs.watch(
      Workspace.path,
      (e) => {
        if (typeof e.type !== 'object') return;
        if ('create' in e.type || 'delete' in e.type) {
          // update
          treeRevision++;
        } else if ('modify' in e.type && e.type.modify.kind == 'rename') {
          // update
          treeRevision++;
        }
      },
      { delayMs: 500, recursive: true }
    );
  });
  Workspace.onActiveDocumentChanged.bind(me, () => {
    if (Workspace.active?.path) selectedId = Workspace.active.path;
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
      directory: true,
    });
    if (!value) return;
    await Workspace.open(value);
  }
</script>

<div class="container">
  {#if Workspace.path}
    <div class="opened">
      <span>{$_('workspace.workspace')}</span>
      <div class="row">
        <code>{Workspace.name ?? $_('workspace.untitled')}</code>
        <button onclick={() => Workspace.openDocument(Workspace.config)}>
          <CogIcon />
        </button>
        <button onclick={() => Workspace.config.save()}>
          <SaveIcon />
        </button>
        <button onclick={askOpenWorkspace}>
          <FolderOpenIcon />
        </button>
      </div>
    </div>

    <div class="tree">
      {#key treeRevision}
        <TreeView
          getItems={async (item?: TreeViewNodeItem<Node>): Promise<Item[]> => {
            const base = item?.key ?? Workspace.path;
            if (!base) return [];
            const items: Item[] = [];

            for (const x of await fs.readDir(base)) {
              if (!$showHidden && x.name.startsWith('.')) continue;
              if (x.isDirectory)
                items.push({
                  key: await path.join(base, x.name),
                  leaf: false,
                  data: { name: x.name },
                });
              if (x.isFile) {
                const key = await path.join(base, x.name),
                  leaf = true;
                if (!item && x.name === 'lib.emmm')
                  items.push({
                    key,
                    leaf,
                    data: { name: x.name, type: 'library' },
                  });
                else if (!item && x.name === 'emmm-workspace.json')
                  items.push({
                    key,
                    leaf,
                    data: { name: x.name, type: 'config' },
                  });
                else if (!item && x.name === 'style.scss')
                  items.push({
                    key,
                    leaf,
                    data: { name: x.name, type: 'stylesheet' },
                  });
                else if (x.name.endsWith('.emmm'))
                  items.push({
                    key,
                    leaf,
                    data: { name: x.name, type: 'document' },
                  });
                else if (assetExts.test(x.name))
                  items.push({
                    key,
                    leaf,
                    data: { name: x.name, type: 'asset' },
                  });
              }
            }
            return items.sort((a, b) => {
              return (
                getOrdering(a) - getOrdering(b) ||
                a.data.name.localeCompare(b.data.name)
              );
            });
          }}
          bind:selected={selectedId}
        >
          {#snippet leaf({ data, key })}
            <TreeButtonItem
              onclick={() => {
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
              }}
            >
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
          {#snippet node({ data })}
            {data.name}
          {/snippet}
        </TreeView>
      {/key}
    </div>
  {:else}
    <div class="empty">
      <hr />
      <div class="note">{$_('workspace.no-workspace-opened')}</div>
      <button onclick={askOpenWorkspace}>
        {$_('workspace.open-folder')}
      </button>
      <hr />
    </div>
  {/if}
</div>

<style>
  .tree {
    flex-grow: 1;
    overflow: auto;
    min-height: 0;
  }
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
