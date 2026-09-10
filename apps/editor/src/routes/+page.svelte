<script lang="ts">
  import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
  import Main from '../lib/Main.svelte';
  import { Memorized } from '$lib/config/Memorized.svelte';
  import { getVersion } from '@tauri-apps/api/app';
  import { arch, platform, version } from '@tauri-apps/plugin-os';
  import { Banner } from '@the_dissidents/svelte-ui';
  import { RustAPI } from '$lib/RustAPI';
  import { fly } from 'svelte/transition';
  import { _ } from 'svelte-i18n';

  import * as z from "zod/v4-mini";

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

  let hide = $state(true);
  let fontProgress = $state(0);

  async function init() {
    const v = await getVersion();
    await currentWindow.setTitle(`emmui ${v} (${arch()}/${platform()}${version()})`);
    await RustAPI.initFonts((v, t) => fontProgress = v / t);
    hide = false;
  }
</script>

<Banner style='error' bind:open={errorBanner}
  text={$_('banner.internal-error')}/>

<main class="container vlayout">

{#await init()}
  <div class="loading" out:fly>
    <div class="text">
      <div class="logo">emmui</div>
      <div>{$_('loading.system-fonts')}</div>
      <progress class="font-progress" max="1" value={fontProgress}></progress>
    </div>
  </div>
{/await}

  <div id="titlebar" data-tauri-drag-region></div>

  <div class="page vlayout flexgrow" class:hide={hide}>
    <Main></Main>
  </div>
</main>

<style lang="scss">
  .hide {
    display: none;
  }

  .loading {
    position: absolute;
    top: 0; left: 0; right: 0; bottom: 0;
    display: flex;
    align-items: center;
    z-index: 9999;

    text-align: center;

    background-color: white;

    .text {
      flex-grow: 1;

      .logo {
        font-family: 'Mluvka';
        font-size: 10em;
        padding-bottom: 0.5em;
      }

      .font-progress {
        display: block;
        width: 16em;
        max-width: 80%;
        margin: 1em auto 0;
        accent-color: #000;
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
