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
  <!-- <div>
    Menu bar
  </div> -->
  <TestPage></TestPage>
</main>

