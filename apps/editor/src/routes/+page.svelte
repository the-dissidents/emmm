<script lang="ts">
  import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
  import Main from '../lib/Main.svelte';
  import { Memorized } from '$lib/config/Memorized.svelte';
  import { getVersion } from '@tauri-apps/api/app';
  import { arch, platform, version } from '@tauri-apps/plugin-os';
  import { Banner } from '@the_dissidents/svelte-ui';
  import { onMount } from 'svelte';
  import { _ } from 'svelte-i18n';

  import * as z from 'zod/v4-mini';

  const currentWindow = getCurrentWindow();

  const windowW = Memorized.$('windowW', z.number(), 1400);
  const windowH = Memorized.$('windowH', z.number(), 900);

  Memorized.init().then(() => {
    currentWindow.setSize(new LogicalSize($windowW, $windowH));
  });

  currentWindow.onCloseRequested(async () => {
    const factor = await currentWindow.scaleFactor();
    const size = (await currentWindow.innerSize()).toLogical(factor);
    $windowW = size.width;
    $windowH = size.height;

    await Memorized.save();
    console.log('saved memorized');
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
    await currentWindow.setTitle(
      `emmui ${v} [${__EMMM_BUILD_ID__}] (${arch()}/${platform()}${version()})`
    );
  }
  onMount(init);
</script>

<Banner
  style="error"
  bind:open={errorBanner}
  text={$_('banner.internal-error')}
/>

<main class="container vlayout">
  <div id="titlebar" data-tauri-drag-region></div>

  <div class="page vlayout flexgrow">
    <Main></Main>
  </div>
</main>

<style lang="scss">
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
