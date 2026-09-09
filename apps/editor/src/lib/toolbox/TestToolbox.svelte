<script lang="ts">
  import { Debug } from "$lib/Debug";
  import { getVoices, say } from "$lib/integration/easter/Eggs";
  import { Interface } from "$lib/Interface.svelte";
  import { platform } from '@tauri-apps/plugin-os';
  import { _, locale, locales } from 'svelte-i18n';

  const hasTTS = platform() == 'macos';

  let inverted = Interface.invertedPreview;

  let voices: string[] = $state([]);
  // let selected: string = $state('');

  (async () => {
    if (hasTTS)
      voices = await getVoices();
  })();
</script>

<h5>
  {$_('eggs.i-mean-it')}
  <br>
  {$_('eggs.nothing-here')}
</h5>

{#if hasTTS}
  <!-- <select bind:value={selected}>
    {#each voices as v}
      <option value={v}>{v}</option>
    {/each}
  </select> -->

  <button
    onclick={async () => {
      Debug.assert(!!Interface.activeEditor);
      const text = Interface.activeEditor.getText();
      const sel = Interface.activeEditor.getSelections().at(0);
      if (!sel) return;
      const s = text.substring(sel.from, sel.to);

      const english = ['Jester', 'Trinoids', 'Good News', 'Bad News', 'Zarvox', 'Organ', 'Bubbles', 'Boing', 'Wobble', 'Whisper'].filter((x) => voices.includes(x));

      let chosen = 'Sinji';
      if (/^[\w\s!"#$%&'()*+,-./:;<=>?@[\\\]^_`{\|}~—–…“”‘’]+$/.exec(s))
        chosen = english[Math.floor(Math.random() * english.length)];

      await say(chosen, text.substring(sel.from, sel.to));
    }}>{$_('eggs.t2')}</button>
{/if}

<br><br>

<label>
  <input type="checkbox" class="button" bind:checked={$inverted}>
  {$_('eggs.fake-button')}
</label>

<br><br>

<select bind:value={$locale}>
  {#each $locales as l}
    <option value={l}>{l}</option>
  {/each}
</select>