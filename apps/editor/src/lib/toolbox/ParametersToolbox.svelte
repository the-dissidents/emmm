<script lang="ts">
  import { deriveColorsFrom } from "$lib/ColorTheme";
  import { Interface } from "$lib/Interface.svelte";
  import { EllipsisIcon, XIcon } from "@lucide/svelte";
  import { Colorpicker, ConfigRow, ConfigTable } from "@the_dissidents/svelte-ui";

  import * as z from 'zod/v4-mini';
  import * as dialog from '@tauri-apps/plugin-dialog';
  import { Memorized } from "$lib/config/Memorized.svelte";
  import { _ } from 'svelte-i18n';

  let autoColor = Memorized.$('autoColorParams', z.boolean(), false);
  let colors = Interface.colors;
  let background = Interface.backgroundImage;

  function doDeriveColors() {
    if ($autoColor) $colors = deriveColorsFrom($colors.theme);
    colors.markChanged();
    Interface.requestRender(0);
  }

  doDeriveColors();
</script>

<h5>{$_('parameters.theme-color')}</h5>
<Colorpicker bind:color={$colors.theme} mode='hsl'
  oninput={doDeriveColors} />

<label><input type="checkbox"
  bind:checked={$autoColor} oninput={doDeriveColors} />
{$_('parameters.derive-rest')}
</label>

<ConfigTable>
  <ConfigRow name={$_('parameters.text')}>
    <div class="hlayout">
      <Colorpicker bind:color={$colors.text} mode='hsl'
        oninput={doDeriveColors} />
    </div>
  </ConfigRow>

  <ConfigRow name={$_('parameters.commentary')}>
    <div class="hlayout">
      <Colorpicker bind:color={$colors.commentary} mode='hsl'
        oninput={doDeriveColors} />
    </div>
  </ConfigRow>

  <ConfigRow name={$_('parameters.link')}>
    <div class="hlayout">
      <Colorpicker bind:color={$colors.link} mode='hsl'
        oninput={doDeriveColors} />
    </div>
  </ConfigRow>

  <ConfigRow name={$_('parameters.highlight')}>
    <div class="hlayout">
      <Colorpicker bind:color={$colors.highlight} mode='hsl'
        oninput={doDeriveColors} />
    </div>
  </ConfigRow>
</ConfigTable>

<h5>{$_('parameters.background')}</h5>
<ConfigTable>
  <ConfigRow name={$_('parameters.image')}>
    <div class="hlayout">
      <input type="text" class="flexgrow" bind:value={$background}>
      <button onclick={async () => {
        const path = await dialog.open({ filters:
          [ { name: $_('parameters.image-filter'), extensions: ['png', 'jpg', 'jpeg', 'webp'] } ] });
        if (path) $background = 'file:' + path;
      }}><EllipsisIcon /></button>
      <button onclick={() => $background = ''}><XIcon /></button>
    </div>
  </ConfigRow>
</ConfigTable>
