<script lang="ts">
  import { Workspace } from "$lib/workspace/Workspace.svelte";
  import { EllipsisIcon } from "@lucide/svelte";
  import { ConfigTable, ConfigRow } from "@the_dissidents/svelte-ui";

  import * as dialog from "@tauri-apps/plugin-dialog";
  import { _ } from "svelte-i18n";
</script>

<fieldset>
  <h3>{$_('tab.workspace-config')}</h3>
  <ConfigTable>
    <ConfigRow name={$_('wkspconfig.location')}>
      <div class="row">
        {Workspace.path}
      </div>
    </ConfigRow>
    <ConfigRow name={$_('wkspconfig.name')}>
      <div class="row">
        <input type="text" bind:value={Workspace.name}>
      </div>
    </ConfigRow>
    <ConfigRow name={$_('wkspconfig.asset-folder')}>
      <div class="row">
        <input type="text" readonly value={Workspace.assetPath}>
        <button onclick={async () => {
          const path = await dialog.open({
            directory: true,
            defaultPath: Workspace.path ?? undefined
          });
          if (path) Workspace.assetPath = path;
        }}>
          <EllipsisIcon />
        </button>
      </div>
    </ConfigRow>
  </ConfigTable>
</fieldset>

<style lang="scss">
  fieldset {
    padding: 25px;
    border: 1px solid lightgray;
    border-radius: 0 0 3px 3px;
    box-sizing: border-box;

    background-color: white;

    margin: 0;
    height: 100%;

    .row {
      width: 100%;
      display: flex;
      flex-direction: row;
      margin-block: 0 6px;

      input {
        flex-grow: 1;
      }
    }
  }
</style>
