<script lang="ts">
  import { deriveColorsFrom } from "$lib/ColorTheme";
  import { Interface } from "$lib/Interface.svelte";
  import Colorpicker from "$lib/ui/Colorpicker.svelte";

  let autoColor = $state(true);

  function doDeriveColors() {
    if (autoColor) Interface.colors = deriveColorsFrom(Interface.colors.theme);
    Interface.requestRender(0);
  }

  doDeriveColors();
</script>

<h5>Theme color</h5>
<Colorpicker bind:color={Interface.colors.theme} mode='hsl'
  oninput={doDeriveColors} />
<hr/>
<label><input type="checkbox"
  bind:checked={autoColor} oninput={doDeriveColors} />
automatically derive the rest
</label>
<h5>Text color</h5>
<Colorpicker bind:color={Interface.colors.text} mode='hsl'
  oninput={doDeriveColors} />
<h5>Commentary color</h5>
<Colorpicker bind:color={Interface.colors.commentary} mode='hsl'
  oninput={doDeriveColors} />
<h5>Link color</h5>
<Colorpicker bind:color={Interface.colors.link} mode='hsl'
  oninput={doDeriveColors} />
<h5>Highlight color</h5>
<Colorpicker bind:color={Interface.colors.highlight} mode='hsl'
  oninput={doDeriveColors} />
