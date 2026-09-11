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

  import { ButtonStrip, ConfigRow, ConfigTable, ListView, StripItem, Tooltip } from "@the_dissidents/svelte-ui";
  import { CheckIcon, CircleArrowUpIcon, CircleXIcon, GlobeIcon, LoaderIcon, TriangleAlertIcon } from "@lucide/svelte";
  import AccountManager from "./AccountManager.svelte";
  import { Memorized } from "$lib/config/Memorized.svelte";
  import { _ } from 'svelte-i18n';
  import { DebouncedTask } from "$lib/details/DebouncedTask";

  let publicIP = $state('');

  let accountName = Memorized.$('weixin-account-name', z.string(), 'default');
  let client = $state(new WeixinClient());
  let token = $derived(client.stableToken);

  let progress = Interface.progress;
  const backgroundImage = Interface.backgroundImage;

  Memorized.onInitialize(() => client = new WeixinClient($accountName));

  type ImgStatus = 'uploaded' | 'external' | 'notUploaded' | 'invalid' | 'error' | 'pending';
  type Img = {
    status: ImgStatus,
    hash?: FileHash,
    url: URL
  };
  let sourceImgs: Img[] = $state([]);

  const defaultReporter: ProgressReporter = (x, total) => $progress = x / total;

  async function uploadImg(img: Img) {
    Interface.status.set($_('weixin.msg.compressing', { values: { url: img.url.href } }));

    await guardAsync(async () => {
      Debug.assert(!!img.hash);
      const file = await RustAPI.compressImage(img.url, 1024 * 1024);
      const url = new URL(img.url);
      if (!url.href.toLowerCase().endsWith('.' + file.ext))
          url.href += '.' + file.ext;
      Interface.status.set($_('weixin.msg.uploading', { values: { path: url.pathname } }));
      await client.uploadSmallImage(file.blob, url.href, img.hash, true);
      await updateImgStatus(img);
      Interface.status.set($_('weixin.msg.done'));
    }, $_('weixin.msg.error-uploading', { values: { url: img.url.href } }));
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
    Interface.status.set(
      $_('weixin.msg.uploaded-images', { values: { count: total, s: total == 1 ? '' : 's' } }));
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

  const updateImgList = new DebouncedTask(async () => {
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
  }, 500);

  async function doPrerender(report: ProgressReporter = defaultReporter) {
    const doc = Interface.frame?.contentDocument;
    const win = Interface.frame?.contentWindow;
    if (!doc || !win) return;

    const result = await guardAsync(() => prerender(win, doc, report),
      $_('weixin.msg.error-prerender'), undefined);
    if (result) {
      const { success, total } = result;
      if (total == 0)
        Interface.status.set($_('weixin.msg.nothing-to-prerender'));
      else if (success == total)
        Interface.status.set($_('weixin.msg.prerendered', { values: { success } }));
      else
        Interface.status.set($_('weixin.msg.prerendered-failed', { values: { success, failed: total - success } }));
    }
    updateImgList.start();
  }

  async function copyResult(html = true) {
    const doc = Interface.frame?.contentDocument;
    const win = Interface.frame?.contentWindow;
    if (!doc || !win) return;
    const {result, notCached} = await postprocess(doc, win);
    await (html ? clipboard.writeHtml(result) : clipboard.writeText(result))
    if (notCached > 0) {
      Interface.status.set($_('weixin.msg.warning-not-uploaded', { values: { count: notCached } }));
    } else {
      Interface.status.set($_('weixin.msg.copied-weixin'));
    }
  }

  const me = {};
  Interface.onFrameLoaded.bind(me, () => updateImgList.start());

  let mode = Memorized.$('weixin-mode', z.enum(['manual', 'automatic']), 'manual');

  async function doAuto(report: ProgressReporter = defaultReporter) {
    await doPrerender(report);
    await uploadAllImages(report);
    await copyResult();
  }
</script>

<div class="vlayout vfill">

<h5>{$_('weixin.credentials')}</h5>
<AccountManager
  bind:account={client}
  onChange={(a) => $accountName = a.name}
/>

<table class="config"><tbody>
  <tr>
    <td>{$_('weixin.public-ip')}</td>
    <td class='hlayout'>
      <input type="text" class="flexgrow" bind:value={publicIP} />
      <button onclick={async () => publicIP = await getIP(GetIPMethod.ipinfo)}>{$_('weixin.get')}</button>
    </td>
  </tr>
  <tr>
    <td>{$_('weixin.stable-token')}</td>
    <td>
      <input type="text" style="width: 100%" disabled value={$token} /><br/>
      <button class="veryimportant" style="width: 100%"
        onclick={async () => {
          try {
            await client.fetchToken();
          } catch (x) {
            await dialog.message(`${x}`, { kind: 'error' });
          }
        }}>{$_('weixin.retrieve-token')}</button>
    </td>
  </tr>
</tbody></table>

<h5>{$_('weixin.publish')}</h5>

<ConfigTable>
  <ConfigRow name={$_('weixin.mode')}>
    <label>
      <input type='checkbox' class="button"
        bind:checked={() => $mode == 'automatic', (x) => $mode = x ? 'automatic' : 'manual'}>
      {$mode}
    </label>
  </ConfigRow>
</ConfigTable>

{#if $mode == 'manual'}

<button onclick={() => doPrerender()} class='veryimportant'>{$_('weixin.prerender')}</button>
<button onclick={() => copyResult(true)} class='veryimportant'>
  {$_('weixin.copy-weixin')}
</button>
<button onclick={() => copyResult(false)} class="important">
  {$_('weixin.copy-text')}
</button>
<hr>
<button onclick={() => uploadAllImages()} class="veryimportant">{$_('weixin.upload-images')}</button>

{:else}

<button onclick={() => doAuto()} class='veryimportant'>
  {$_('weixin.render-and-copy')}
</button>

{/if}

<ListView style="min-height: 300px; flex-grow: 1;"
  items={sourceImgs}
  columns={[
    ['button', { header: '', align: 'end', width: 'auto' }],
    ['status', { header: '', width: 'auto' }],
    ['name', { header: $_('weixin.name'), ellipsis: true, width: '1fr' }],
  ]}
>
  {#snippet name(item)}
    {decodeURIComponent(item.url.href.split('/').at(-1)!)}
  {/snippet}
  {#snippet button(item)}
    {#if item.status == 'external'}
      <button onclick={() => uploadImg(item)}>
        {$_('weixin.force')}
      </button>
    {:else if item.status == 'notUploaded'}
      <button onclick={() => uploadImg(item)}>
        {$_('weixin.upload')}
      </button>
    {:else if item.status == 'uploaded'}
      <button onclick={() => uploadImg(item)}>
        {$_('weixin.reupload')}
      </button>
    {:else if item.status == 'error'}
      <button onclick={() => uploadImg(item)}>
        {$_('weixin.retry')}
      </button>
    {/if}
  {/snippet}
  {#snippet status(item)}
    {#if item.status == 'error'}
      <Tooltip position='right' text={$_('weixin.tooltip.error')}>
        <span><TriangleAlertIcon/></span>
      </Tooltip>
    {:else if item.status == 'invalid'}
      <Tooltip position='right' text={$_('weixin.tooltip.invalid')}>
        <span><CircleXIcon/></span>
      </Tooltip>
    {:else if item.status == 'external'}
      <Tooltip position='right' text={$_('weixin.tooltip.external')}>
        <span><GlobeIcon/></span>
      </Tooltip>
    {:else if item.status == 'notUploaded'}
      <Tooltip position='right' text={$_('weixin.tooltip.not-uploaded')}>
        <span><CircleArrowUpIcon/></span>
      </Tooltip>
    {:else if item.status == 'uploaded'}
      <Tooltip position='right' text={$_('weixin.tooltip.uploaded')}>
        <span><CheckIcon/></span>
      </Tooltip>
    {:else if item.status == 'pending'}
      <Tooltip position='right' text={$_('weixin.tooltip.pending')}>
        <span><LoaderIcon/></span>
      </Tooltip>
    {:else}
      {Debug.never(item.status)}
    {/if}
  {/snippet}
</ListView>

<hr>

<ButtonStrip>
  <StripItem onclick={async () => {
    console.log(await client.getAssets('image', 0, 10));
  }}>assets</StripItem>
  <StripItem onclick={async () => {
    console.log(await client.getDrafts(0, 10));
  }}>drafts</StripItem>
  <StripItem onclick={async () => {
    console.log(await client.getPublications(0, 10));
  }}>publications</StripItem>
</ButtonStrip>

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

