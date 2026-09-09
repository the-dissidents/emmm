<script lang="ts">
  import { assert, Debug } from "../../Debug";
  import { WeixinClient } from './API.svelte';
  import { guardAsync, Interface } from '../../Interface.svelte';
  import { getIP, GetIPMethod, type ProgressReporter } from '../../Util';
  import { postprocess, prerender } from "./Postprocess";
  import { RustAPI, type FileHash } from "$lib/RustAPI";

  import * as clipboard from '@tauri-apps/plugin-clipboard-manager';
  import * as dialog from '@tauri-apps/plugin-dialog';
  import * as z from 'zod/v4-mini';

  import { ConfigRow, ConfigTable, ListView, Tooltip } from "@the_dissidents/svelte-ui";
  import { CheckIcon, CircleArrowUpIcon, CircleXIcon, GlobeIcon, LoaderIcon, TriangleAlertIcon } from "@lucide/svelte";
  import AccountManager from "./AccountManager.svelte";
  import { Memorized } from "$lib/config/Memorized.svelte";

  let publicIP = $state('');

  let accountName = Memorized.$('weixin-account-name', z.string(), 'default');
  let account = $state(new WeixinClient());
  let token = $derived(account.stableToken);

  let progress = Interface.progress;
  const backgroundImage = Interface.backgroundImage;

  Memorized.onInitialize(() => account = new WeixinClient($accountName));

  type ImgStatus = 'uploaded' | 'external' | 'notUploaded' | 'invalid' | 'error' | 'pending';
  type Img = {
    status: ImgStatus,
    hash?: FileHash,
    url: URL
  };
  let sourceImgs: Img[] = $state([]);

  const defaultReporter: ProgressReporter = (x, total) => $progress = x / total;

  async function uploadImg(img: Img) {
    Interface.status.set(`compressing: ${img.url.href}`);

    await guardAsync(async () => {
      Debug.assert(!!img.hash);
      const file = await RustAPI.compressImage(img.url, 1024 * 1024);
      const url = new URL(img.url);
      if (!url.href.toLowerCase().endsWith('.' + file.ext))
          url.href += '.' + file.ext;
      Interface.status.set(`uploading: ${url.pathname}`);
      await account.uploadSmallImage(file.blob, url.href, img.hash, true);
      await updateImgStatus(img);
      Interface.status.set(`done`);
    }, `error when uploading ${img.url.href}`);
  }

  async function uploadAllImages(report: ProgressReporter = defaultReporter) {
    const total = sourceImgs.filter((x) => x.status == 'notUploaded').length;
    if (total == 0) return;

    let p = 0;
    report(0, total);
    for (const img of sourceImgs) {
      if (img.status == 'notUploaded') {
        await uploadImg(img);
        p++;
        report(p, total);
      }
    }
    Interface.status.set(`uploaded ${total} image${total == 1 ? '' : 's'}`);
  }

  async function updateImgStatus(img: Img) {
    img.status = 'pending';
    if (!img.hash)
      img.hash = await RustAPI.hashFile(img.url);
    if (await WeixinClient.getSmallImageCacheUrl(img.hash)) {
      img.status = 'uploaded';
    } else if (img.url.protocol !== 'file:') {
      img.status = 'external';
    } else {
      img.status = 'notUploaded';
    }
  }

  async function updateImgList() {
    let doc = Interface.frame?.contentDocument;
    assert(doc !== undefined && doc !== null);
    sourceImgs = [];

    const promises: Promise<void>[] = [];

    if ($backgroundImage) {
      const img: Img = $state({ status: 'pending', url: new URL($backgroundImage) });
      promises.push(updateImgStatus(img));
      sourceImgs.push(img);
    }

    for (const x of [...doc.querySelectorAll('img')]) {
      try {
        const url = new URL(x.dataset.originalSrc ?? x.src);
        let img: Img = $state({ status: 'pending', url });
        sourceImgs.push(img);
        if (x.complete && x.naturalWidth > 0) {
          promises.push(updateImgStatus(img));
        } else if (x.complete) {
          img.status = 'invalid';
        }
      } catch (_) {

      }
    }
    await Promise.allSettled(promises);
  }

  async function doPrerender(report: ProgressReporter = defaultReporter) {
    const doc = Interface.frame?.contentDocument;
    const win = Interface.frame?.contentWindow;
    if (!doc || !win) return;

    const result = await guardAsync(() => prerender(win, doc, report),
      'error during prerender', undefined);
    if (result) {
      const { success, total } = result;
      if (total == 0)
        Interface.status.set(`Nothing to prerender`);
      else if (success == total)
        Interface.status.set(`Prerendered ${success} image[s]`);
      else
        Interface.status.set(`Prerendered ${success} image[s], ${total - success} failed`);
    }
    void updateImgList();
  }

  async function copyResult(html = true) {
    const doc = Interface.frame?.contentDocument;
    const win = Interface.frame?.contentWindow;
    if (!doc || !win) return;
    const {result, notCached} = await postprocess(doc, win);
    await (html ? clipboard.writeHtml(result) : clipboard.writeText(result))
    if (notCached > 0) {
      Interface.status.set(`warning: ${notCached} local image[s] not uploaded`);
    } else {
      Interface.status.set(`successfully copied for Weixin`);
    }
  }

  Interface.onFrameLoaded.bind(() => updateImgList());

  let mode = Memorized.$('weixin-mode', z.enum(['manual', 'automatic']), 'manual');

  async function doAuto(report: ProgressReporter = defaultReporter) {
    await doPrerender(report);
    await uploadAllImages(report);
    await copyResult();
  }
</script>

<div class="vlayout vfill">

<h5>Credentials</h5>
<AccountManager
  bind:account={account}
  onChange={(a) => $accountName = a.name}
/>

<table class="config"><tbody>
  <tr>
    <td>public ip</td>
    <td class='hlayout'>
      <input type="text" class="flexgrow" bind:value={publicIP} />
      <button onclick={async () => publicIP = await getIP(GetIPMethod.ipinfo)}>get</button>
    </td>
  </tr>
  <tr>
    <td>stable token</td>
    <td>
      <input type="text" style="width: 100%" disabled value={$token} /><br/>
      <button class="veryimportant" style="width: 100%"
        onclick={async () => {
          try {
            await account.fetchToken();
          } catch (x) {
            await dialog.message(`${x}`, { kind: 'error' });
          }
        }}>retrieve token</button>
    </td>
  </tr>
</tbody></table>

<h5>Publish</h5>

<ConfigTable>
  <ConfigRow name="mode">
    <label>
      <input type='checkbox' class="button"
        bind:checked={() => $mode == 'automatic', (x) => $mode = x ? 'automatic' : 'manual'}>
      {$mode}
    </label>
  </ConfigRow>
</ConfigTable>

{#if $mode == 'manual'}

<button onclick={() => doPrerender()} class='veryimportant'>prerender</button>
<button onclick={() => copyResult(true)} class='veryimportant'>
  copy rendered result for Weixin
</button>
<button onclick={() => copyResult(false)} class="important">
  copy rendered result as text
</button>
<hr>
<button onclick={() => uploadAllImages()} class="veryimportant">upload images</button>

{:else}

<button onclick={() => doAuto()} class='veryimportant'>
  render and copy article for Weixin
</button>

{/if}

<ListView style="min-height: 300px; flex-grow: 1;"
  items={sourceImgs}
  columns={[
    ['button', { header: '', align: 'end', width: 'auto' }],
    ['status', { header: '', width: 'auto' }],
    ['name', { header: 'name', ellipsis: true, width: '1fr' }],
  ]}
>
  {#snippet name(item)}
    {decodeURIComponent(item.url.href.split('/').at(-1)!)}
  {/snippet}
  {#snippet button(item)}
    {#if item.status == 'external'}
      <button onclick={() => uploadImg(item)}>
        force
      </button>
    {:else if item.status == 'notUploaded'}
      <button onclick={() => uploadImg(item)}>
        upload
      </button>
    {:else if item.status == 'uploaded'}
      <button onclick={() => uploadImg(item)}>
        reupload
      </button>
    {:else if item.status == 'error'}
      <button onclick={() => uploadImg(item)}>
        retry
      </button>
    {/if}
  {/snippet}
  {#snippet status(item)}
    {#if item.status == 'error'}
      <Tooltip position='right' text="this image is loaded, but an error occurred when trying to upload it">
        <span><TriangleAlertIcon/></span>
      </Tooltip>
    {:else if item.status == 'invalid'}
      <Tooltip position='right' text="this image failed to load!">
        <span><CircleXIcon/></span>
      </Tooltip>
    {:else if item.status == 'external'}
      <Tooltip position='right' text="no need to upload this image">
        <span><GlobeIcon/></span>
      </Tooltip>
    {:else if item.status == 'notUploaded'}
      <Tooltip position='right' text="loaded but not uploaded yet">
        <span><CircleArrowUpIcon/></span>
      </Tooltip>
    {:else if item.status == 'uploaded'}
      <Tooltip position='right' text="sucessfully uploaded">
        <span><CheckIcon/></span>
      </Tooltip>
    {:else if item.status == 'pending'}
      <Tooltip position='right' text="pending">
        <span><LoaderIcon/></span>
      </Tooltip>
    {:else}
      {Debug.never(item.status)}
    {/if}
  {/snippet}
</ListView>

</div>

<style>
  button {
    margin-bottom: 5px;
  }

  hr {
    margin-block: 5px;
    padding: 0;
  }

  label {
    width: 100%;
  }
</style>

