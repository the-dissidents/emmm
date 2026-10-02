<script lang="ts">
  import { assert, Debug } from "../../Debug";
  import { plugins } from '$lib/plugins/Settings';
  import MetadataEditor from '$lib/plugins/weixin/MetadataEditor.svelte';
  import HistoryEditor from '$lib/plugins/weixin/HistoryEditor.svelte';
  import { saveArticleDraft, uploadDraftImages } from '$lib/plugins/weixin/Drafts';
  import { getArticleDigest } from '$lib/plugins/weixin/Digest';
  import { Workspace } from '$lib/workspace/Workspace.svelte';
  import { getIP, GetIPMethod } from '../../Util';
  import { WeixinClient } from './API.svelte';
  import { guardAsync, Interface } from '../../Interface.svelte';
  import { type ProgressReporter } from '../../Util';
  import { getWeixinPublicIP, weixinNetwork, UntrustedWeixinServerError } from './Network';
  import ServerManager from './ServerManager.svelte';
  import { weixinServers, saveWeixinServers, type WeixinServer } from './Servers';
  import { invoke } from '@tauri-apps/api/core';
  import { get } from 'svelte/store';
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
  let draftBusy = $state(false);
  let networkBusy = $state(false);
  let networkError = $state('');
  let pendingTrust = $state<{ server: WeixinServer, hostKeys: string[], fingerprints: string } | null>(null);

  async function handleNetworkError(error: unknown) {
    if (error instanceof UntrustedWeixinServerError) {
      try {
        const result = await invoke<{hostKeys: string[], fingerprints: string}>('probe_weixin_server', {
          host: error.server.host, sshPort: error.server.sshPort,
        });
        pendingTrust = { server: error.server, ...result };
      } catch (failure) { networkError = String(failure); }
    } else { networkError = String(error); }
  }

  async function trustServer() {
    if (!pendingTrust) return;
    const pending = pendingTrust;
    const current = get(weixinServers).find(server => server.id === pending.server.id);
    if (!current || current.host !== pending.server.host || current.sshPort !== pending.server.sshPort) return;
    await saveWeixinServers(get(weixinServers).map(server => server.id === current.id
      ? { ...server, hostKeys: pending.hostKeys } : server));
    pendingTrust = null;
    await testNetwork();
  }

  $effect(() => {
    $weixinNetwork;
    $plugins.forwarding;
    publicIP = '';
    networkError = '';
    pendingTrust = null;
  });

  async function testNetwork() {
    if (!$plugins.forwarding) { publicIP = await getIP(GetIPMethod.ipinfo); return; }
    networkBusy = true;
    publicIP = '';
    networkError = '';
    try {
      publicIP = await getWeixinPublicIP();
    } catch (error) {
      await handleNetworkError(error);
    } finally {
      networkBusy = false;
    }
  }

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
    if ($plugins.drafts) { await saveDraft(true, report); return; }
    await doPrerender(report);
    await uploadAllImages(report);
    await copyResult();
  }
  async function saveDraft(copy = false, report: ProgressReporter = defaultReporter) {
    if (draftBusy) return;
    draftBusy = true;
    networkError = '';
    const active = Workspace.active;
    const currentClient = client;
    try {
      if (!active) throw new Error('请打开文章');
      const source = active.source;
      await currentClient.fetchToken();
      await Interface.render();
      const doc = Interface.frame?.contentDocument;
      const win = Interface.frame?.contentWindow;
      if (!doc || !win || Workspace.active !== active || active.source !== source)
        throw new Error('文章已变更，请重新保存');
      if (doc.querySelector('[data-weixin-plugin-error]')) throw new Error('往期回顾未生成');
      const result = await prerender(win, doc, report, true);
      if (result.success !== result.total) throw new Error('部分内容预渲染失败');
      await uploadDraftImages(currentClient, doc, Interface.backgroundImage.get(), report);
      const {result: content, notCached} = await postprocess(doc, win);
      if (Workspace.active !== active || active.source !== source || client !== currentClient)
        throw new Error('文章或公众号已变更，请重新保存');
      const parsed = active.parseData?.data;
      if (!parsed) throw new Error('文章尚未解析完成');
      const digest = await getArticleDigest(parsed);
      if (Workspace.active !== active || active.source !== source) throw new Error('文章已变更，请重新保存');
      const saved = await saveArticleDraft({ client: currentClient, source, doc,
        key: active.filePath ?? active.id, content, notCached, digest });
      if (copy) await clipboard.writeHtml(content);
      Interface.status.set(saved.unchanged ? '草稿已同步' : saved.updated ? '草稿已更新' : '已保存到草稿箱');
      updateImgList.start();
    } catch (error) {
      await handleNetworkError(error);
      Interface.status.set(`保存草稿失败：${error}`);
    } finally { draftBusy = false; $progress = undefined; }
  }
</script>

<div class="vlayout vfill">

<h5>{$_('weixin.credentials')}</h5>
<AccountManager
  bind:account={client}
  onChange={(a) => $accountName = a.name}
/>

{#if $plugins.forwarding}
<ServerManager busy={networkBusy || draftBusy} />
{/if}
{#if pendingTrust}
  <table class="config"><tbody><tr>
    <td>{$_('weixin.network.fingerprint')}</td>
    <td><textarea readonly rows={pendingTrust.fingerprints.split('\n').length} value={pendingTrust.fingerprints}></textarea>
      <button onclick={trustServer}>{$_('weixin.network.trust')}</button></td>
  </tr></tbody></table>
{/if}
{#if networkError}<div role="alert">{networkError}</div>{/if}
<table class="config"><tbody>
  <tr>
    <td>{$plugins.forwarding ? $_('weixin.public-ip') : '公网 IP'}</td>
    <td class='hlayout'>
      <input type="text" class="flexgrow" readonly={$plugins.forwarding} bind:value={publicIP} />
      <button disabled={networkBusy || draftBusy} onclick={testNetwork}>
        {#if networkBusy}<LoaderIcon />{:else}{$_('weixin.get')}{/if}
      </button>
    </td>
  </tr>
  <tr>
    <td>{$_('weixin.stable-token')}</td>
    <td>
      <input type="text" style="width: 100%" disabled value={$token} /><br/>
      <button class="veryimportant" style="width: 100%"
        disabled={networkBusy || draftBusy}
        onclick={async () => {
          networkBusy = true;
          networkError = '';
          try {
            await client.fetchToken($plugins.forwarding);
          } catch (x) {
            if ($plugins.forwarding) await handleNetworkError(x);
            else await dialog.message(`${x}`, { kind: 'error' });
          } finally {
            networkBusy = false;
          }
        }}>{$_('weixin.retrieve-token')}</button>
    </td>
  </tr>
</tbody></table>

{#if $plugins.metadata}<MetadataEditor />{/if}
{#if $plugins.history}<HistoryEditor />{/if}

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

<button onclick={() => doAuto()} disabled={draftBusy} class='veryimportant'>
  {$plugins.drafts ? '渲染并保存草稿' : $_('weixin.render-and-copy')}
</button>

{/if}

{#if $plugins.drafts}
<button class="veryimportant" disabled={draftBusy} onclick={() => saveDraft()}>保存到草稿箱</button>
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
  textarea { width: 100%; box-sizing: border-box; resize: none; }

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
