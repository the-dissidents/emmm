<script lang="ts">
    import { assert } from "./Debug";
    import ListView, { type ListButtonCell, type ListCell, type ListColumn, type ListItem, type ListViewHandleIn, type ListViewHandleOut } from './ui/ListView.svelte';
    import { SvelteMap } from 'svelte/reactivity';
    import { Weixin } from './weixin/API';
    import { Interface } from './Interface.svelte';
    import { getIP, GetIPMethod, loadImage } from './Util';
    import { RustAPI } from "./RustAPI";
    import { path } from "@tauri-apps/api";
    import { tempDir } from "@tauri-apps/api/path";
    import { convertFileSrc } from "@tauri-apps/api/core";
    import * as clipboard from '@tauri-apps/plugin-clipboard-manager';
    import { postprocess } from "./weixin/Postprocess";
    import * as dialog from '@tauri-apps/plugin-dialog';
    import { writeFile } from "@tauri-apps/plugin-fs";

    let publicIP = $state('');
    let appid = Weixin.appid;
    let secret = Weixin.secret;
    let stableToken = Weixin.stableToken;

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
        status: { type: 'text', content: string, alt: string },
        refresh: ListButtonCell | undefined,
        mode: ImgStatus,
        url: URL
    };
    let sourceImgs: Img[] = [];

    async function uploadImg(img: Img) {
        Interface.status.set(`compressing: ${img.url.href}`);
        try {
            const file = await loadImage(img.url, /* maxSizeMB: */ 1);
            console.log(file);
            if (!img.url.href.endsWith('png'))
                img.url.href += '.png';
            Interface.status.set(`uploading: ${img.url.href}`);
            await Weixin.uploadSmallImage(file, img.url.href, true);
            updateImg(img);
            Interface.status.set(`done`);
        } catch (e) {
            Interface.status.set(`error when uploading ${img.url.href}: ${e}`);
            img.mode = 'notUploaded';
            img.status.content = '⚠️';
            img.status.alt = 'this image is loaded, but an error occurred when trying to upload it';
            throw e;
        }
    }

    async function uploadAll() {
        for (const img of sourceImgs) {
            if (img.mode == 'notUploaded') {
                await uploadImg(img);
            }
        }
    }

    function updateImg(img: Img) {
        img.mode = 'pending';
        const realhref = img.url.href.endsWith('png') ? img.url.href : img.url.href + '.png';
        if (Weixin.smallImageCache.has(realhref)) {
            img.mode = 'ok';
            img.status.content = '🟢';
            img.status.alt = 'already uploaded';
            img.refresh = {
                type: 'button',
                text: 'refresh',
                onClick: () => uploadImg(img),
            };
        } else if (img.url.protocol !== 'file:') {
            img.mode = 'ok';
            img.status.content = '⚪';
            img.status.alt = 'no need to upload this image';
            img.refresh = {
                type: 'button',
                text: 'force',
                onClick: () => uploadImg(img),
            };
        } else {
            img.mode = 'notUploaded';
            img.status.content = '🟡';
            img.status.alt = 'loaded but not uploaded yet';
        }
    }

    Interface.onFrameLoaded.bind(() => {
        let doc = Interface.frame?.contentDocument;
        assert(doc !== undefined && doc !== null);
        sourceImgs = [];
        let items: ListItem[] = [...doc.querySelectorAll('img')].map((x) => {
            const url = new URL(x.dataset.originalSrc ?? x.src);
            let img: Img = { 
                mode: 'pending',
                status: { type: 'text' as const, content: '', alt: '' },
                refresh: undefined,
                url: url
            };
            sourceImgs.push(img);
            if (x.complete && x.naturalWidth > 0) {
                updateImg(img);
            } else if (x.complete) {
                img.mode = 'error';
                img.status.content = '🔴';
                img.status.alt = 'this image failed to load!';
            }
            let name = { 
                type: 'text', 
                content: url.href.split('/').at(-1)! 
            } satisfies ListCell;
            return {cols: { refresh: img.refresh, status: img.status, name }};
        });
        imgListHandleOut!.reset(items);
    });

    async function test() {
        Interface.status.set(`compressing with RustAPI`);
        try {
            const out = await path.join(await tempDir(), 'out.jpg');
            const file = await dialog.open();
            if (!file) return;
            const data = await RustAPI.compressImage(file, 1024*1024);
            writeFile(out, data.stream());
            Interface.status.set(`compressed to ${out}`);
            console.log(out);
        } catch (e) {
            Interface.status.set(`error: ${e}`);
        }
    }

    async function fetchArticles() {
        articleListHandleIn.provideMoreItems = async () => {
            if (!$stableToken)
                return { items: [], more: false };
            const listItems = articleListHandleOut!.getItems();
            const { total: _, drafts } = await Weixin.getDrafts(listItems.length);
            const items: ListItem[] = [];
            for (const draft of drafts) {
                draft.articles.map((article, i) => items.push({
                    cols: {
                        action: { type: 'button', text: 'write', 
                            onClick: async () => {
                                const doc = Interface.frame?.contentDocument;
                                const win = Interface.frame?.contentWindow;
                                if (!doc || !win) return;
                                const {result, notCached: _} = await postprocess(doc, win);
                                Weixin.writeDraftArticle(draft.id, i, {
                                    ...article,
                                    content: result
                                });
                                Interface.status.set(`Updated ${draft.id}`);
                            }
                        },
                        type: { type: 'text', content: article.articleType },
                        author: { type: 'text', 
                            content: article.articleType == 'news' ? article.author : ''
                        },
                        title: { type: 'text', content: article.title },
                    }
                }));
            }
                
            return { items, more: items.length > 0 };
        };
        articleListHandleOut?.reset();
    }

    async function fetchPermimgs() {
        permimgListHandleIn.provideMoreItems = async () => {
            if (!$stableToken)
                return { items: [], more: false };
            const listItems = permimgListHandleOut!.getItems();
            const { total: _, assets } = await Weixin.getAssets('image', listItems.length);
            console.log(assets);
            const items: ListItem[] = [];
            for (const x of assets) {
                let path: string | undefined;
                try {
                    path = await Weixin.downloadAsset(x.id, x.name);
                } catch (_) {
                    console.warn('unable to download:', x.name, x.id);
                }
                console.log('got:', path);
                items.push({ cols: {
                    test: { type: 'button', text: 'insert', 
                        onClick: () => {
                            // TODO
                        }
                    },
                    refresh: { type: 'button', text: 'refresh', 
                        onClick: async () => {
                            await Weixin.downloadAsset(x.id, x.name, true);
                            permimgListHandleOut?.reset();
                        } 
                    },
                    img: path ? { 
                        type: 'image', 
                        url: convertFileSrc(path),
                        height: '50px', 
                    } : undefined,
                    name: { type: 'text', content: x.name },
                } });
            };
            console.log(items);
            return { items, more: items.length > 0 };
        };
        permimgListHandleOut?.reset();
    }
</script>

<div class="vlayout contain">

<h5>Connections & Credentials</h5>
<table><tbody>
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
            <button style="width: 100%" 
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
    // await navigator.clipboard.write([new ClipboardItem({'text/html': result})]);
    if (notCached > 0) {
        Interface.status.set(`warning: ${notCached} local image[s] not uploaded`);
    } else {
        Interface.status.set(`successfully copied for Weixin`);
    }
}}>copy rendered result for Weixin</button>
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
<button onclick={() => test()}>test</button>

<h5>Images</h5>
<button onclick={() => uploadAll()}>upload images</button>
<ListView header={imgListHeader} bind:hout={imgListHandleOut} style="min-height: 300px">
</ListView>

<h5>Other articles</h5>
<button onclick={() => fetchArticles()}>fetch</button>
<ListView header={articleListHeader} 
    hin={articleListHandleIn} 
    bind:hout={articleListHandleOut} style="min-height: 300px">
</ListView>

<h5>Permanent images</h5>
<button onclick={() => fetchPermimgs()}>fetch</button>
<ListView header={permimgListHeader} 
    hin={permimgListHandleIn} 
    bind:hout={permimgListHandleOut} style="min-height: 300px">
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
    table {
        width: 100%;
    }
    table tr > td:nth-child(1) {
        font-size: 80%;
        padding-right: 5px;
        /* font-weight: bold; */
        text-align: end;
        align-content: start;
    }
</style>

