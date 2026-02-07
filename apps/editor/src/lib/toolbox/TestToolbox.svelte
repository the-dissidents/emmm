<script lang="ts">
  import { Debug } from "$lib/Debug";
  import { getVoices, say } from "$lib/integration/easter/Eggs";
  import { Interface } from "$lib/Interface.svelte";
  import { platform } from '@tauri-apps/plugin-os';

  const hasTTS = platform() == 'macos';

  let voices: string[] = $state([]);
  // let selected: string = $state('');

  (async () => {
    voices = await getVoices();
  })();
</script>

<h5>
  I mean it!
  <br>
  There’s nothing to see here!
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
    }}>t2</button>
{/if}
