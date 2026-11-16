<script lang="ts">
  import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
  import Main from '../lib/Main.svelte';
  import { Memorized } from '$lib/config/Memorized.svelte';
  import { getVersion } from '@tauri-apps/api/app';
  import { arch, platform, version } from '@tauri-apps/plugin-os';
  import * as dialog from '@tauri-apps/plugin-dialog';
  import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
  import { openUrl } from '@tauri-apps/plugin-opener';
  import { Banner } from '@the_dissidents/svelte-ui';
  import { onMount } from 'svelte';
  import { _ } from 'svelte-i18n';

  import * as z from "zod/v4-mini";
  import { Workspace } from '$lib/workspace/Workspace.svelte';

  const currentWindow = getCurrentWindow();

  const windowW = Memorized.$('windowW', z.number(), 1400);
  const windowH = Memorized.$('windowH', z.number(), 900);

  Memorized.init().then(() => {
    currentWindow.setSize(new LogicalSize($windowW, $windowH));
  });

  currentWindow.onCloseRequested(async (e) => {
    const factor = await currentWindow.scaleFactor();
    const size = (await currentWindow.innerSize()).toLogical(factor);
    $windowW = size.width;
    $windowH = size.height;

    await Memorized.save();
    if (!await Workspace.askBeforeClose())
      e.preventDefault();
  });

  let errorBanner = $state(false);
  window.addEventListener('error', () => {
    errorBanner = true;
  });
  window.addEventListener('unhandledrejection', () => {
    errorBanner = true;
  });

  function isNewerVersion(latestTag: string, currentVer: string): boolean {
    const parse = (s: string) =>
      s.trim().replace(/^[vV]/, '').split(/[-+]/)[0].split('.').map((n) => parseInt(n, 10) || 0);
    const [lMaj = 0, lMin = 0, lPat = 0] = parse(latestTag);
    const [cMaj = 0, cMin = 0, cPat = 0] = parse(currentVer);
    if (lMaj !== cMaj) return lMaj > cMaj;
    if (lMin !== cMin) return lMin > cMin;
    return lPat > cPat;
  }

  async function checkForUpdates(currentVer: string) {
    try {
      const apiBase = ['https:', '', 'api.github.com', 'repos', 'the-dissidents', 'emmm'].join('/');
      const webBase = ['https:', '', 'github.com', 'the-dissidents', 'emmm'].join('/');
      const resp = await tauriFetch(`${apiBase}/releases?per_page=5`, {
        method: 'GET',
        headers: {
          'Accept': 'application/vnd.github+json',
          'User-Agent': `emmui/${currentVer}`
        }
      });
      if (!resp.ok) return;
      const releases = (await resp.json()) as Array<{ tag_name?: string; html_url?: string; draft?: boolean }>;
      const latest = releases.find((r) => !r.draft && r.tag_name);
      if (!latest || !latest.tag_name) return;

      if (isNewerVersion(latest.tag_name, currentVer)) {
        const confirmed = await dialog.ask(
          `检测到新版本 ${latest.tag_name}（当前版本 v${currentVer}）。\n是否前往 GitHub Release 页面下载更新？`,
          {
            title: '发现新版本',
            kind: 'info',
            okLabel: '前往下载',
            cancelLabel: '稍后提醒'
          }
        );
        if (confirmed) {
          await openUrl(latest.html_url || `${webBase}/releases/tag/${latest.tag_name}`);
        }
      }
    } catch (err) {
      console.warn('Auto update check skipped:', err);
    }
  }

  async function init() {
    const v = await getVersion();
    await currentWindow.setTitle(`emmui ${v} (${arch()}/${platform()}${version()})`);
    void checkForUpdates(v);
  }

  onMount(init);
</script>

<Banner style='error' bind:open={errorBanner} text={$_('banner.internal-error')}/>

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
