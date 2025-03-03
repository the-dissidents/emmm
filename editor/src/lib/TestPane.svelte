<script lang="ts">
    import { fetch } from '@tauri-apps/plugin-http';
    import { assert } from "./Debug";
    import ListView, { type GrowResult, type ListButtonCell, type ListColumn, type ListItem, type ListViewHandleIn, type ListViewHandleOut } from './ui/ListView.svelte';
    import { SvelteMap } from 'svelte/reactivity';
    import { Weixin } from './Weixin';
    import { Interface } from './Interface.svelte';
    import { getIP, GetIPMethod } from './Util';

    let publicIP = $state('');
    let appid = Weixin.appid;
    let secret = Weixin.secret;
    let stableToken = Weixin.stableToken;

    const listHeader = new SvelteMap<string, ListColumn>([
        ['status', {name: 'status', type: 'button', width: '15%'}],
        ['url', {name: 'url', type: 'text', 
            contentStyle: 'text-overflow: ellipsis; white-space: nowrap; overflow: hidden;'}],
    ]);
    let listHandleOut: ListViewHandleOut | undefined = $state();

    Interface.onFrameLoaded.bind(() => {
        let doc = Interface.frame?.contentDocument;
        assert(doc !== undefined && doc !== null);
        let cache = Weixin.smallImageCache;
        let items: ListItem[] = [...doc.querySelectorAll('img')].map((x) => {
            const url = new URL(x.src);
            let btn: ListButtonCell = {
                type: 'button',
                text: cache.has(url.href) ? 'upload' : 'refresh',
                onClick(self) {
                    // TODO
                },
            };
            return {cols: {
                status: btn,
                path: { type: 'text', content: url.href }
            }};
        });
        listHandleOut!.reset(items);
    });
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
<button onclick={() => listHandleOut?.reset()}>refresh</button>

<h5>Publishing</h5>
<ListView header={listHeader} bind:hout={listHandleOut}>
</ListView>

</div>

<style>
    .contain {
        height: 100%;
        max-height: 100%;
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

