<script lang="ts">
  import { Settings } from '$lib/Settings';
  import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
  import TestPage from '../lib/TestPage.svelte';
  import { Memorized } from '$lib/config/Memorized.svelte';
  import { getVersion } from '@tauri-apps/api/app';
  import { arch, platform, version } from '@tauri-apps/plugin-os';
  import { Banner } from '@the_dissidents/svelte-ui';
  import { RustAPI } from '$lib/RustAPI';
  import { fly } from 'svelte/transition';

  const currentWindow = getCurrentWindow();

  Memorized.init();

  Settings.init().then(() => {
    currentWindow.setSize(new LogicalSize(
      Settings.get('windowW'),
      Settings.get('windowH')));
  });

  currentWindow.onCloseRequested(async () => {
    const factor = await currentWindow.scaleFactor();
    const size = (await currentWindow.innerSize()).toLogical(factor);
    await Settings.set('windowW', size.width);
    await Settings.set('windowH', size.height);

    await Memorized.save();
  });

  let errorBanner = $state(false);
  window.addEventListener('error', () => {
    errorBanner = true;
  });
  window.addEventListener('unhandledrejection', () => {
    errorBanner = true;
  });

  async function init() {
    const v = await getVersion();
    await currentWindow.setTitle(`emmui ${v} (${arch()}/${platform()}${version()})`);

    await RustAPI.initFonts();
  }
</script>

<Banner style='error' bind:open={errorBanner}
  text="Internal error: please contact the developers"/>

<main class="container vlayout">

{#await init()}
  <div class="loading" out:fly>
    <div class="text">
      <div class="logo">emmui</div>
      <div>Loading system fonts</div>
    </div>
  </div>
{/await}

  <div id="titlebar" data-tauri-drag-region>
  </div>
  <div class="page vlayout flexgrow">
    <TestPage></TestPage>
  </div>
</main>

<style lang="scss">
  .loading {
    position: absolute;
    top: 0; left: 0; right: 0; bottom: 0;
    display: flex;
    align-items: center;
    z-index: 999;

    text-align: center;

    background-color: white;

    .text {
      flex-grow: 1;

      .logo {
        font-family: 'Mluvka';
        font-size: 10em;
        padding-bottom: 0.5em;
      }
    }
  }

  #titlebar {
    min-height: 30px;
    padding: 0;
    width: 100%;
  }

  .container {
    display: flex;
    flex-direction: column;

    margin: 0;
    padding: 0;
    height: 100vh;
    max-height: 100vh;
    box-sizing: border-box;
  }

  .page {
    padding: 0 10px 10px 10px;
  }
</style>
