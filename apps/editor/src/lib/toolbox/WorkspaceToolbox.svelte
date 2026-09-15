<script lang="ts">
  import * as fs from "@tauri-apps/plugin-fs";
  import * as dialog from '@tauri-apps/plugin-dialog';
  import * as path from '@tauri-apps/api/path';
  import * as z from 'zod/v4-mini';

  import { ConfigRow, ConfigTable, TreeButtonItem, TreeView, type TreeViewItem } from '@the_dissidents/svelte-ui'
  import { Memorized } from "$lib/config/Memorized.svelte";
  import { FileImageIcon, FileTextIcon, Library, LibraryBigIcon, LibraryIcon } from "@lucide/svelte";
  import { Workspace } from "$lib/workspace/Workspace.svelte";

  let workspacePath = Memorized.$('workspacePath', z.string(), '');
  let assetsPath = Memorized.$('assetsPath', z.string(), '');
  let showHidden = Memorized.$('showHidden', z.boolean(), false);

  const assetExts = /\.(jpg|jpeg|png|gif|webp|svg|tiff)$/;

  type Item = TreeViewItem<{
    name: string,
    type: 'document' | 'asset' | 'config' | 'library'
  }, {
    name: string
  }>;

  let selectedId = $state<string | null>(null);

  function getOrdering(a: Item): number {
    if (!a.leaf) return 0;
    if (a.data.type == 'library') return 1;
    if (a.data.type == 'config') return 2;
    if (a.data.type == 'document') return 3;
    if (a.data.type == 'asset') return 4;
    return a.data.type satisfies never;
  }
</script>

<div class="container">

<ConfigTable>
  <ConfigRow name={"项目"} style="display: flex; flex-direction: row;">
    <input class="flexgrow" type='text' value={$workspacePath} readonly />
    <button onclick={async () => {
      const value = await dialog.open({
        defaultPath: $workspacePath ?? undefined,
        directory: true
      });
      if (!value) return;
      $workspacePath = value;
    }}>choose</button>
  </ConfigRow>
  <ConfigRow name={"资源目录"} style="display: flex; flex-direction: row;">
    <input class="flexgrow" type='text' value={$assetsPath} readonly />
    <button onclick={async () => {
      const value = await dialog.open({
        defaultPath: $workspacePath ?? undefined,
        directory: true
      });
      if (!value) return;
      $assetsPath = value;
    }}>choose</button>
  </ConfigRow>
</ConfigTable>
<div>
</div>

<TreeView getItems={async (item): Promise<Item[]> => {
  const base = item?.key ?? $workspacePath;
  if (!base) return [];
  const items: Item[] = [];

  for (const x of await fs.readDir(base)) {
    if (!$showHidden && x.name.startsWith('.')) continue;
    if (x.isDirectory)
      items.push({ key: await path.join(base, x.name), leaf: false, data: { name: x.name } });
    if (x.isFile) {
      const key = await path.join(base, x.name), leaf = true;
      if (x.name == 'lib.emmm')
        items.push({ key, leaf, data: { name: x.name, type: 'library' } });
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
}} style="flex-grow: 1;">
  {#snippet leaf({data, key})}
    <TreeButtonItem onclick={() => {
      if (data.type == 'document') {
        const existing = Workspace.documents.find((x) => x.filePath == key);
        if (existing) {
          Workspace.setActive(existing.id);
        } else {
          Workspace.open(key);
        }
      }
    }}>
      {#if data.type == 'document'}
      <FileTextIcon />
      {:else if data.type == 'asset'}
      <FileImageIcon />
      {:else if data.type == 'library'}
      <LibraryBigIcon />
      {/if}
      <span class="name">{data.name}</span>
    </TreeButtonItem>
  {/snippet}
  {#snippet node({data})}
    {data.name}
  {/snippet}
</TreeView>

</div>

<style>
  .container {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .flexgrow, .name {
    flex-grow: 1;
  }
</style>
