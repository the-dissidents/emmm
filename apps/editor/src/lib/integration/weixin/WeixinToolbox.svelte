<script lang="ts">
  import { assert, Debug } from "../../Debug";
  import { Weixin } from './API';
  import { Interface } from '../../Interface.svelte';
  import { getIP, GetIPMethod } from '../../Util';
  import { postprocess } from "./Postprocess";
  import { RustAPI } from "$lib/RustAPI";

  import * as clipboard from '@tauri-apps/plugin-clipboard-manager';
  import * as dialog from '@tauri-apps/plugin-dialog';
  import { ListView, Tooltip } from "@the_dissidents/svelte-ui";
  import { CheckIcon, CircleArrowUpIcon, CircleXIcon, GlobeIcon, LoaderIcon, TriangleAlertIcon } from "@lucide/svelte";

  let publicIP = $state('');
  let appid = Weixin.appid;
  let secret = Weixin.secret;
  let stableToken = Weixin.stableToken;

  let progress = Interface.progress;

  type ImgStatus = 'uploaded' | 'external' | 'notUploaded' | 'invalid' | 'error' | 'pending';
  type Img = {
    status: ImgStatus,
    url: URL
  };
  let sourceImgs: Img[] = $state([]);

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
      img.status = 'error';
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
      img.status = 'uploaded';
    } else if (img.url.protocol !== 'file:') {
      img.status = 'external';
    } else {
      img.status = 'notUploaded';
    }
  }

  Interface.onFrameLoaded.bind(() => {
    let doc = Interface.frame?.contentDocument;
    assert(doc !== undefined && doc !== null);
    sourceImgs = [];
    [...doc.querySelectorAll('img')].map((x) => {
      const url = new URL(x.dataset.originalSrc ?? x.src);
      let img: Img = {
        status: 'pending',
        url: url
      };
      sourceImgs.push(img);
      if (x.complete && x.naturalWidth > 0) {
        updateImg(img);
      } else if (x.complete) {
        img.status = 'invalid';
      }
    });
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
      <button class="veryimportant" style="width: 100%"
        onclick={async () => {
          try {
            await Weixin.fetchToken();
          } catch (x) {
            await dialog.message(`${x}`, { kind: 'error' });
          }
        }}>retrieve token</button>
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
}} class='veryimportant'>copy rendered result for Weixin</button>
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
}} class="important">copy rendered result as text</button>

<h5>Images</h5>
<button onclick={() => uploadAll()} class="veryimportant">upload images</button>

<ListView style="min-height: 300px; flex-grow: 1;"
  items={sourceImgs}
  columns={[
    ['button', { header: 'action', align: 'end' }],
    ['status', { header: '' }],
    ['name', { header: 'name', ellipsis: true }],
  ]}
>
  {#snippet name(item)}
    {item.url.href.split('/').at(-1)!}
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
        refresh
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
      <LoaderIcon/>
    {:else}
      {Debug.never(item.status)}
    {/if}
  {/snippet}
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

