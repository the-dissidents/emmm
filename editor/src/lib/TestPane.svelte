<script lang="ts">
    import { assert } from "./Debug";
    import ListView, { type GrowResult, type ListButtonCell, type ListCell, type ListColumn, type ListItem, type ListViewHandleIn, type ListViewHandleOut } from './ui/ListView.svelte';
    import { SvelteMap } from 'svelte/reactivity';
    import { Weixin } from './Weixin';
    import { Interface } from './Interface.svelte';
    import { cssPath, getIP, GetIPMethod, loadImage } from './Util';
    import { RustAPI } from "./RustAPI";
    import { path } from "@tauri-apps/api";
    import { tempDir } from "@tauri-apps/api/path";

    let publicIP = $state('');
    let appid = Weixin.appid;
    let secret = Weixin.secret;
    let stableToken = Weixin.stableToken;

    const listHeader = new SvelteMap<string, ListColumn>([
        ['refresh', {name: '', type: 'button', width: '15%'}],
        ['status', {name: '', type: 'text', width: '10%'}],
        ['name', {name: 'name', type: 'text', 
            contentStyle: 'text-overflow: ellipsis; white-space: nowrap; overflow: hidden;'}],
    ]);
    let listHandleOut: ListViewHandleOut | undefined = $state();

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
        if (Weixin.smallImageCache.has(img.url.href)) {
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
        listHandleOut!.reset(items);
    });

    async function copyForWeixin() {
        let doc = Interface.frame?.contentDocument;
        let win = Interface.frame?.contentWindow;
        if (!doc || !win) throw new Error('iframe not loaded');
        
        let befores = new Map<string, string>();
        let afters = new Map<string, string>();
        // prepare ::before/::after data
        doc.querySelectorAll('*').forEach((elem) => {
            const path = cssPath(elem);
            getPseudo('::before', befores);
            getPseudo('::after', afters);

            function getPseudo(c: string, s: Map<string, string>) {
                let content = win!
                    .getComputedStyle(elem, c)
                    .getPropertyValue('content');
                if (content && content !== 'none' && content !== "normal") {
                    content = content.replace(/^["'](.*)["']$/, "$1");
                    s.set(path, content);
                }
            }
        });

        let copy = doc.cloneNode(true) as Document;
        let imgCache = Weixin.smallImageCache;
        let notCached = 0;
        copy.querySelectorAll('*').forEach((elem) => {
            const path = cssPath(elem);

            // inline all ::before and ::after
            let before = befores.get(path);
            let after = afters.get(path);
            if (before) elem.insertBefore(copy.createTextNode(before), elem.firstChild);
            if (after) elem.appendChild(copy.createTextNode(after));

            // remove outlinks
            if (elem.tagName == 'A') {
                console.log(elem);
                (elem as HTMLAnchorElement).href = '';
                // TODO: detect mp.weixin.qq.com?
            }

            // subtitle images URLs to uploaded versions
            else if (elem.tagName == 'IMG') {
                console.log(elem);
                const img = elem as HTMLImageElement;
                const url = new URL(img.dataset.originalSrc ?? img.src);
                const cached = imgCache.get(url.href);
                if (cached) {
                    img.src = cached;
                    img.dataset.originalSrc = undefined;
                } else if (url.protocol == 'file:') {
                    notCached++;
                }
            }
        });

        let processed = copy.documentElement.outerHTML;
        await navigator.clipboard.write([new ClipboardItem({'text/html': processed})]);
        if (notCached > 0) {
            Interface.status.set(`warning: ${notCached} local image[s] not uploaded`);
        } else {
            Interface.status.set(`successfully copied for Weixin`);
        }
    }

    async function test() {
        Interface.status.set(`compressing with RustAPI`);
        try {
            const out = await path.join(await tempDir(), 'out.jpg');
            await RustAPI.compressImage(
                '/Users/emf/Downloads/ZzArt-337773807-34.png', 
                out, 1024*1024, 1080);
            Interface.status.set(`compressed to ${out}`);
            console.log(out);
        } catch (e) {
            Interface.status.set(`error: ${e}`);
        }
    }
</script>

<div class="vlayout contain">

<h5>Connections & Credentials</h5>
<table><tbody>
    <tr>
        <td>public ip</td>
        <td class='hlayout'>
            <input type="text" class="flexgrow" bind:value={publicIP} />
            <button onclick={async () => publicIP = await getIP(GetIPMethod.ipChaxun)}>get</button>
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
<button onclick={() => copyForWeixin()}>copy rendered result for Weixin</button>
<button onclick={() => test()}>test</button>

<h5>Images</h5>
<button onclick={() => uploadAll()}>upload images</button>
<ListView header={listHeader} bind:hout={listHandleOut}>
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

