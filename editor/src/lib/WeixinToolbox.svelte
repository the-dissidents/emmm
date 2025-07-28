<script lang="ts">
    import { assert } from "./Debug";
    import ListView, { type GrowResult, type ListButtonCell, type ListCell, type ListColumn, type ListItem, type ListViewHandleIn, type ListViewHandleOut } from './ui/ListView.svelte';
    import { SvelteMap } from 'svelte/reactivity';
    import { Weixin } from './Weixin';
    import { Interface } from './Interface.svelte';
    import { cssPath, getIP, GetIPMethod, loadImage, parseCssString, replaceTagName } from './Util';
    import { RustAPI } from "./RustAPI";
    import { path } from "@tauri-apps/api";
    import { tempDir } from "@tauri-apps/api/path";
    import { convertFileSrc } from "@tauri-apps/api/core";
    import * as clipboard from '@tauri-apps/plugin-clipboard-manager';
    import { inlineCss } from "@the_dissidents/dom-css-inliner";
    import { get, type Readable, type Writable } from "svelte/store";
    import { onMount } from "svelte";
    import { Settings } from "./Settings";

    let wx = $state<Weixin>();

    let publicIP = $state('');
    let appid = $state<string>('');
    let secret = $state<string>('');
    let stableToken: Readable<string>;
    
    Settings.onInitialized(async () => {
        wx = await Weixin.getAccount('default');
        console.log('loaded', wx);
        appid = get(wx.appid);
        secret = get(wx.secret);
        stableToken = wx.stableToken;
    });

    function updateWx() {
        wx!.appid.set(appid);
        wx!.secret.set(secret);
        wx!.save();
    }

    onMount(async () => {
    });

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
            Interface.status.set(`uploading: ${img.url.href}`);
            await wx!.uploadSmallImage(file, img.url.href, true);
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
        if (wx!.smallImageCache.has(img.url.href)) {
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

    const CONVERT_TO_SECTION = new Set([
        'address', 'article', 'aside', 'blockquote', 'dd', 'div', 'dl', 'dt', 'fieldset', 
        'figcaption', 'figure', 'footer', 'form', 'header', 
        'li', 'main', 'nav', 'ol', 'pre', 'ul'
    ]);

    const CONVERT_TO_SPAN = new Set([
        'abbr', 'acronym', 'b', 'bdo', 'big', 'cite', 'code', 'dfn', 'em', 'i', 
        'kbd', 'output', 'q', 'samp', 'small', 'strong', 'time', 'tt', 'var'
    ]);

    const PRESERVE = new Set([
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 
        'table', 'thead', 'tbody', 'tfoot', 'th', 'td', 'tr',
        'p', 'span', 'section', 'img', 'a', 'hr', 'br', 'sub', 'sup', 
    ]);
    
    async function renderWeixin() {
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
                    s.set(path, parseCssString(content));
                }
            }
        });

        let copy = doc.cloneNode(true) as Document;
        let imgCache = wx!.smallImageCache;
        let notCached = 0;
        copy.body.querySelectorAll('*').forEach((elem) => {
            // inline all ::before and ::after
            const path = cssPath(elem);
            let before = befores.get(path);
            let after = afters.get(path);
            if (before) elem.insertBefore(new Text(before), elem.firstChild);
            if (after) elem.appendChild(new Text(after));

            // remove outlinks
            if (elem.tagName == 'A') {
                // console.log(elem);
                const anchor = elem as HTMLAnchorElement;
                try {
                    const url = new URL(anchor.href);
                    if (url.host != 'mp.weixin.qq.com')
                        (elem as HTMLAnchorElement).href = '';
                } catch (_) {
                    (elem as HTMLAnchorElement).href = '';
                }
            }

            // subtitle images URLs to uploaded versions
            else if (elem.tagName == 'IMG') {
                // console.log(elem);
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

        inlineCss(copy, { removeStyleTags: true });

        copy.body.querySelectorAll('*').forEach((elem) => {
            elem.removeAttribute('class');
            if (CONVERT_TO_SECTION.has(elem.tagName.toLowerCase())) {
                replaceTagName(elem, 'section', copy);
            }
            else if (CONVERT_TO_SPAN.has(elem.tagName.toLowerCase())) {
                replaceTagName(elem, 'span', copy);
            }
            else if (!PRESERVE.has(elem.tagName.toLowerCase())) {
                console.warn('unhandled element type:', elem.tagName);
            }
        });
        return { result: copy.body.innerHTML, notCached };
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

    async function fetchArticles() {
        articleListHandleIn.provideMoreItems = async () => {
            if (!$stableToken)
                return { items: [], more: false };
            const listItems = articleListHandleOut!.getItems();
            const { total: _, items: pubs } = await wx!.gePublications(listItems.length);
            const items: ListItem[] = [];
            for (const pub of pubs) {
                pub.articles.map((article, i) => items.push({
                    cols: {
                        action: { type: 'button', text: 'insert', 
                            onClick: async () => {
                                console.log(article.title, article.coverUrl, article.url);
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
            const { total: _, assets } = await wx!.getAssets('image', listItems.length);
            console.log(assets);
            const items: ListItem[] = [];
            for (const x of assets) {
                let path: string | undefined;
                try {
                    path = await wx!.downloadAsset(x.id, x.name);
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
                            await wx!.downloadAsset(x.id, x.name, true);
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
            <input type="text" class="flexgrow" bind:value={appid}
                oninput={() => updateWx()} />
        </td>
    </tr>
    <tr>
        <td>secret</td>
        <td class='hlayout'>
            <input type="text" class="flexgrow" bind:value={secret}
                oninput={() => updateWx()} />
        </td>
    </tr>
    <tr>
        <td>stable token</td>
        <td>
            <input type="text" style="width: 100%" disabled value={$stableToken} /><br/>
            <button style="width: 100%" 
                onclick={() => wx!.fetchToken()}>retrieve token</button>
        </td>
    </tr>
</tbody></table>

<h5>Publish</h5>
<button onclick={async () => {
    const {result, notCached} = await renderWeixin();
    await clipboard.writeHtml(result);
    // await navigator.clipboard.write([new ClipboardItem({'text/html': result})]);
    if (notCached > 0) {
        Interface.status.set(`warning: ${notCached} local image[s] not uploaded`);
    } else {
        Interface.status.set(`successfully copied for Weixin`);
    }
}}>copy rendered result for Weixin</button>
<button onclick={async () => {
    const {result, notCached} = await renderWeixin();
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

