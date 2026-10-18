<script lang="ts">
  import { Workspace } from "$lib/workspace/Workspace.svelte";
  import { EllipsisIcon, XIcon } from "@lucide/svelte";
  import { Collapsible, ConfigRow, ConfigTable } from "@the_dissidents/svelte-ui";
  import { _, locale } from "svelte-i18n";
  import { menu } from "@tauri-apps/api";
  import { PluginManager } from "$lib/plugin/Plugin.svelte";

  import * as dialog from "@tauri-apps/plugin-dialog";
  import * as fs from "@tauri-apps/plugin-fs";
  import { Debug } from "$lib/Debug";

  function preferredName(names: Record<string, string>) {
    if ($locale && $locale in names)
        return names[$locale];

    const entries = Object.entries(names);
    if (entries.length > 0)
        return entries[0][1];
    return $_('plugin.unknown');
  }

</script>

{#each Workspace.plugins.instances as inst}
<Collapsible>
  {#snippet header()}
  <div class="header">
    <span>{preferredName(inst.manifest.names)} <code>{inst.manifest.id}</code></span>
    <div class="spacer"></div>
    <button onclick={() => Workspace.plugins.unload(inst)}>
      <XIcon />
    </button>
  </div>
  {/snippet}

  <ConfigTable>
    {#each inst.manifest.ui as item}
      {#if 'input' in item}
        <ConfigRow name={preferredName(item.names)}>
        <div class="value">
          {#if item.input == 'checkbox'}
            <input type='checkbox'
              readonly={item.readonly}
              bind:checked={
                () => inst.getConfig(item.key) as boolean,
                (v) => inst.setConfig(item.key, v)
              } />
          {:else if item.input == 'textbox'}
            <input type='text'
              readonly={item.readonly}
              bind:value={
                () => inst.getConfig(item.key) as string,
                (v) => inst.setConfig(item.key, v)
              } />
          {:else if item.input == 'textarea'}
            <textarea
              readonly={item.readonly}
              bind:value={
                () => inst.getConfig(item.key) as string,
                (v) => inst.setConfig(item.key, v)
              }>
            </textarea>
          {:else if item.input == 'path'}
            <input type='text'
              readonly={item.readonly}
              bind:value={
                () => inst.getConfig(item.key) as string,
                (v) => inst.setConfig(item.key, v)
              } />
            <button onclick={async () => {
              const result = await dialog.open();
              if (!result) inst.setConfig(item.key, result);
            }}><EllipsisIcon /></button>
          {:else if item.input == 'select'}
            <select bind:value={
              () => inst.getConfig(item.key) as string,
              (v) => inst.setConfig(item.key, v)
            }>
              {#each item.options as opt}
              {@const [key, value] = typeof opt == 'string'
                  ? [opt, opt]
                  : [opt[0], preferredName(opt[1])]}
                <option value={key}>{value}</option>
              {/each}
            </select>
          {:else}
            {Debug.never(item)}
          {/if}
        </div>
        </ConfigRow>
      {:else if 'action' in item}
        <ConfigRow name=''>
          <button onclick={() => inst.callAction(item.key)}>
            {preferredName(item.names)}
          </button>
        </ConfigRow>
      {/if}
    {:else}
      <ConfigRow name="">
        <span class="note">此插件没有提供选项</span>
      </ConfigRow>
    {/each}
  </ConfigTable>
</Collapsible>
{/each}

<hr>

<button onclick={async () => {
  const installed = (await PluginManager.listInstalled()).filter(
    (id) => !Workspace.plugins.instances.find((x) => x.manifest.id == id));

  (await menu.Menu.new({
    items: [
      ...(installed.length > 0 ? installed.map((id) => ({
        text: id,
        action: () => Workspace.plugins.loadInstalled(id)
      })) : [
        {
          text: '没有更多安装的插件',
          enabled: false,
        }
      ]),
      {
        item: 'Separator'
      },
      {
        text: '安装其它插件',
        action: async () => {
          const path = await dialog.open({
            filters: [ { name: 'emmm plugin', extensions: ['js'] } ]
          });
          if (!path) return;
          const source = await fs.readTextFile(path);
          await Workspace.plugins.load(source);
          await PluginManager.install(path);
        }
      }
    ]
  })).popup();
}} class='veryimportant'>
  添加插件
</button>

<style lang="scss">
  .header {
    display: flex;
    flex-direction: row;
    align-items: center;

    code {
      color: #999;
      text-transform: none;
    }

    .spacer {
      flex-grow: 1;
    }

    button {
      padding: 2px;
      margin: 0px;
    }
  }

  div.value {
    width: 100%;
    display: flex;
    flex-direction: row;
    justify-items: stretch;
  }

  hr {
    margin-block: 5px 3px;
  }
</style>
