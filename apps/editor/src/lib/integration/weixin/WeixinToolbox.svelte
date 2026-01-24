<script lang="ts">
  import { assert } from "../../Debug";
  import ListView, { type ListButtonCell, type ListCell, type ListColumn, type ListItem, type ListViewHandleIn, type ListViewHandleOut } from '../../ui/ListView.svelte';
  import { SvelteMap } from 'svelte/reactivity';
  import { Weixin } from './API';
  import { Interface } from '../../Interface.svelte';
  import { getIP, GetIPMethod } from '../../Util';
  import * as clipboard from '@tauri-apps/plugin-clipboard-manager';
  import { postprocess } from "./Postprocess";
  import { RustAPI } from "$lib/RustAPI";

  let publicIP = $state('');
  let appid = Weixin.appid;
  let secret = Weixin.secret;
  let stableToken = Weixin.stableToken;

  let progress = Interface.progress;

  const imgListHeader = new SvelteMap<string, ListColumn>([
    ['refresh', {name: '', type: 'button', width: '15%'}],
    ['status', {name: '', type: 'text', width: '10%'}],
    ['name', {name: 'name', type: 'text',
      contentStyle: 'text-overflow: ellipsis; white-space: nowrap; overflow: hidden;'}],
  ]);
  let imgListHandleOut: ListViewHandleOut | undefined = $state();

  const articleListHeader = new SvelteMap<string, ListColumn>([
    ['action', {name: '', type: 'button', width: '15%'}],
    ['type', {name: '', type: 'text', width: '10%'}],
    ['author', {name: 'author', type: 'text', width: '15%'}],
    ['title', {name: 'title', type: 'text',
      contentStyle: 'text-overflow: ellipsis; white-space: nowrap; overflow: hidden;'}],
  ]);
  let articleListHandleOut: ListViewHandleOut | undefined = $state();
  let articleListHandleIn: ListViewHandleIn = $state({});

  const permimgListHeader = new SvelteMap<string, ListColumn>([
    ['test', {name: '', type: 'button', width: '15%'}],
    ['refresh', {name: '', type: 'button', width: '15%'}],
    ['img', {name: '', type: 'image', width: '25%'}],
    ['name', {name: 'name', type: 'text',
      contentStyle: 'text-overflow: ellipsis; white-space: nowrap; overflow: hidden;'}],
  ]);
  let permimgListHandleOut: ListViewHandleOut | undefined = $state();
  let permimgListHandleIn: ListViewHandleIn = $state({});

  type ImgStatus = 'ok' | 'notUploaded' | 'error' | 'pending';
  type Img = {
    indicator: { type: 'text', content: string, alt: string },
    refresh: ListButtonCell | undefined,
    status: ImgStatus,
    url: URL
  };
  let sourceImgs: Img[] = [];

  async function uploadImg(img: Img) {
    Interface.status.set(`compressing: ${img.url.href}`);
    try {
      const file = await RustAPI.compressImage(img.url, 1024 * 1024);
      console.log(file);
      const url = new URL(img.url);
      if (!url.href.toLowerCase().endsWith('.' + file.ext))
          url.href += '.' + file.ext;
      Interface.status.set(`uploading: ${url.href}`);
      await Weixin.uploadSmallImage(file.blob, url.href, img.url.href, true);
      updateImg(img);
      Interface.status.set(`done`);
    } catch (e) {
      Interface.status.set(`error when uploading ${img.url.href}: ${e}`);
      img.status = 'notUploaded';
      img.indicator.content = '⚠️';
      img.indicator.alt = 'this image is loaded, but an error occurred when trying to upload it';
      throw e;
    }
  }

  async function uploadAll() {
    const total = sourceImgs.filter((x) => x.status == 'notUploaded').length;
    if (total == 0) return;

    $progress = 0;
    for (const img of sourceImgs) {
      if (img.status == 'notUploaded') {
        await uploadImg(img);
        $progress += 1 / total;
      }
    }
    $progress = undefined;
    Interface.status.set(`uploaded ${total} image${total == 1 ? '' : 's'}`);
  }

  function updateImg(img: Img) {
    img.status = 'pending';
    const realhref = img.url.href;
    if (Weixin.smallImageCache.has(realhref)) {
      img.status = 'ok';
      img.indicator.content = '🟢';
      img.indicator.alt = 'already uploaded';
      img.refresh = {
        type: 'button',
        text: 'refresh',
        onClick: () => uploadImg(img),
      };
    } else if (img.url.protocol !== 'file:') {
      img.status = 'ok';
      img.indicator.content = '⚪';
      img.indicator.alt = 'no need to upload this image';
      img.refresh = {
        type: 'button',
        text: 'force',
        onClick: () => uploadImg(img),
      };
    } else {
      img.status = 'notUploaded';
      img.indicator.content = '🟡';
      img.indicator.alt = 'loaded but not uploaded yet';
    }
  }

  Interface.onFrameLoaded.bind(() => {
    let doc = Interface.frame?.contentDocument;
    assert(doc !== undefined && doc !== null);
    sourceImgs = [];
    let items: ListItem[] = [...doc.querySelectorAll('img')].map((x) => {
      const url = new URL(x.dataset.originalSrc ?? x.src);
      let img: Img = {
        status: 'pending',
        indicator: { type: 'text' as const, content: '', alt: '' },
        refresh: undefined,
        url: url
      };
      sourceImgs.push(img);
      if (x.complete && x.naturalWidth > 0) {
        updateImg(img);
      } else if (x.complete) {
        img.status = 'error';
        img.indicator.content = '🔴';
        img.indicator.alt = 'this image failed to load!';
      }
      let name = {
        type: 'text',
        content: url.href.split('/').at(-1)!
      } satisfies ListCell;
      return {cols: { refresh: img.refresh, status: img.indicator, name }};
    });
    imgListHandleOut!.reset(items);
  });
</script>

<div class="vlayout contain">

<h5>Connections & Credentials</h5>
<table class="config"><tbody>
  <tr>
    <td>public ip</td>
    <td class='hlayout'>
      <input type="text" class="flexgrow" bind:value={publicIP} />
      <button onclick={async () => publicIP = await getIP(GetIPMethod.ipinfo)}>get</button>
    </td>
  </tr>
  <tr>
    <td>appid</td>
    <td class='hlayout'>
      <input type="text" class="flexgrow" value={$appid}
        oninput={(x) => $appid = x.currentTarget.value} />
    </td>
  </tr>
  <tr>
    <td>secret</td>
    <td class='hlayout'>
      <input type="text" class="flexgrow" bind:value={$secret}
        oninput={(x) => $secret = x.currentTarget.value} />
    </td>
  </tr>
  <tr>
    <td>stable token</td>
    <td>
      <input type="text" style="width: 100%" disabled value={$stableToken} /><br/>
      <button style="width: 100%" class="important"
        onclick={() => Weixin.fetchToken()}>retrieve token</button>
    </td>
  </tr>
</tbody></table>

<h5>Publish</h5>
<button onclick={async () => {
  const doc = Interface.frame?.contentDocument;
  const win = Interface.frame?.contentWindow;
  if (!doc || !win) return;
  const {result, notCached} = await postprocess(doc, win);
  await clipboard.writeHtml(result);
  if (notCached > 0) {
    Interface.status.set(`warning: ${notCached} local image[s] not uploaded`);
  } else {
    Interface.status.set(`successfully copied for Weixin`);
  }
}} class='important'>copy rendered result for Weixin</button>
<button onclick={async () => {
  const doc = Interface.frame?.contentDocument;
  const win = Interface.frame?.contentWindow;
  if (!doc || !win) return;
  const {result, notCached} = await postprocess(doc, win);
  await clipboard.writeText(result);
  if (notCached > 0) {
    Interface.status.set(`warning: ${notCached} local image[s] not uploaded`);
  } else {
    Interface.status.set(`successfully copied HTML as text`);
  }
}}>copy rendered result as text</button>

<h5>Images</h5>
<button onclick={() => uploadAll()} class="important">upload images</button>
<ListView header={imgListHeader} bind:hout={imgListHandleOut} style="min-height: 300px">
</ListView>

</div>

<style>
  .contain {
    height: 100%;
    max-height: 100%;
  }
  button {
    margin-bottom: 5px;
  }
</style>

