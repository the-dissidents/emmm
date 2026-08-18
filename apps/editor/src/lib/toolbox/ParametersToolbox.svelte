<script lang="ts">
  import { deriveColorsFrom } from "$lib/ColorTheme";
  import { Interface } from "$lib/Interface.svelte";
  import { Colorpicker } from "@the_dissidents/svelte-ui";

  let autoColor = $state(false);
  let colors = Interface.colors;

  function doDeriveColors() {
    if (autoColor) $colors = deriveColorsFrom($colors.theme);
    colors.markChanged();
    Interface.requestRender(0);
  }

  doDeriveColors();
</script>

<h5>Theme color</h5>
<Colorpicker bind:color={$colors.theme} mode='hsl'
  oninput={doDeriveColors} />
<hr/>
<label><input type="checkbox"
  bind:checked={autoColor} oninput={doDeriveColors} />
automatically derive the rest
</label>
<h5>Text color</h5>
<Colorpicker bind:color={$colors.text} mode='hsl'
  oninput={doDeriveColors} />
<h5>Commentary color</h5>
<Colorpicker bind:color={$colors.commentary} mode='hsl'
  oninput={doDeriveColors} />
<h5>Link color</h5>
<Colorpicker bind:color={$colors.link} mode='hsl'
  oninput={doDeriveColors} />
<h5>Highlight color</h5>
<Colorpicker bind:color={$colors.highlight} mode='hsl'
  oninput={doDeriveColors} />

<h5>Background</h5>
