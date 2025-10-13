<script lang="ts">
  import { Settings } from '$lib/Settings';
  import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
  import TestPage from '../lib/TestPage.svelte';

  const currentWindow = getCurrentWindow();

  Settings.init().then(() => {
    currentWindow.setSize(new LogicalSize(
      Settings.get('windowW'), 
      Settings.get('windowH')));
  });

  currentWindow.onCloseRequested(async (ev) => {
    const factor = await currentWindow.scaleFactor();
    const size = (await currentWindow.innerSize()).toLogical(factor);
    Settings.set('windowW', size.width);
    Settings.set('windowH', size.height);
  });
</script>


<main class="container vlayout fill">
  <div id="titlebar" data-tauri-drag-region>
  </div>
  <div class="page vlayout flexgrow">
    <TestPage></TestPage>
  </div>
</main>

<style>
  #titlebar {
    min-height: 30px;
    padding: 0;
    width: 100%;
  }

  .container {
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
