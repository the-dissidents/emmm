<script lang="ts">
    import { fetch } from '@tauri-apps/plugin-http';
    import { assert } from "./Debug";
    import { Settings } from './Settings';
    import ListView, { type ListColumn, type ListItem, type ListViewHandleIn, type ListViewHandleOut } from './ui/ListView.svelte';
    import { SvelteMap } from 'svelte/reactivity';

    let status = $state('ok');
    let publicIP = $state('');
    let appid = $state('');
    let appsecret = $state('');
    let stableToken = $state('');
    let expireTime = $state(0);

    const listHeader = new SvelteMap<string, ListColumn>([
        ['type', {name: 'type', type: 'text', hAlign: 'right'}],
        ['id', {name: 'id', type: 'text'}],
        ['name', {name: 'name', type: 'text'}]
    ]);
    let listHandleOut: ListViewHandleOut | undefined = $state();
    let listHandleIn: ListViewHandleIn = {
        async provideMoreItems() {
            let items = listHandleOut!.getItems();
            let newItems: ListItem[] = [];
            for (let i = 0; i < 10; i++) {
                newItems.push({
                    cols: {
                        type: { type: 'text', content: 'image' },
                        id: { type: 'text', content: '12345678' },
                        name: { type: 'text', content: `test entry #${items.length + i}` }
                    }
                });
            }
            await new Promise(resolve => setTimeout(resolve, 5000));
            return {items: newItems, more: items.length < 100};
        },
    };

    Settings.onInitialized(() => {
        appid = Settings.get('weixinAppId');
        appsecret = Settings.get('weixinAppSecret');
    });

    enum GetIPMethod {
        ipChaxun,
        ipify
    }

    async function getIP(method: GetIPMethod) {
        let r: Response, ip: string;
        switch (method) {
            case GetIPMethod.ipChaxun:
                r = await fetch('https://2025.ipchaxun.com/', 
                    { signal: AbortSignal.timeout(2000) });
                if (!r.ok) throw new Error();
                ip = (await r.json()).ip;
                break;
            case GetIPMethod.ipify:
                r = await fetch('https://api.ipify.org/?format=json', 
                    { signal: AbortSignal.timeout(2000) });
                if (!r.ok) throw new Error();
                ip = (await r.json()).ip;
                break;
        }
        assert(typeof ip == 'string');
        publicIP = ip;
    }

    async function getToken() {
        if (appid == '') 
            throw new Error(`appid is empty`);
        if (appsecret == '') 
            throw new Error(`secret is empty`);
        const r = await fetch('https://api.weixin.qq.com/cgi-bin/stable_token', {
            method: 'POST',
            body: JSON.stringify({
                "grant_type": "client_credential",
                "appid": appid,
                "secret": appsecret
            })
        });
        if (!r.ok) throw new Error(`status=${r.status}`);
        let json = await r.json();
        if (json.errcode) throw new Error(`errcode=${json.errcode}`);
        stableToken = json.access_token as string;
        status = `got token; expires in ${json.expires_in}`;
        expireTime = Date.now() + (<number>json.expires_in - 10) * 1000;
    }

    async function getAssetCount() {
        if (stableToken == '') 
            throw new Error(`token is empty`);
        if (Date.now() > expireTime)
            throw new Error(`token expired`);
        const r = await fetch(
            'https://api.weixin.qq.com/cgi-bin/material/get_materialcount?'
            + new URLSearchParams({access_token: stableToken}));
        if (!r.ok) throw new Error(`status=${r.status}`);
        let json = await r.json();
        if (json.errcode) throw new Error(`errcode=${json.errcode}`);
        console.log(json);
    }
</script>

<div class="vlayout contain">

<p>{status}</p>
<h5>Connections & Credentials</h5>
<table><tbody>
    <tr>
        <td>public ip</td>
        <td class='hlayout'>
            <input type="text" class="flexgrow" bind:value={publicIP} />
            <button onclick={() => getIP(GetIPMethod.ipChaxun)}>get</button>
        </td>
    </tr>
    <tr>
        <td>appid</td>
        <td class='hlayout'>
            <input type="text" class="flexgrow" bind:value={appid}
                oninput={() => Settings.set('weixinAppId', appid)}/>
        </td>
    </tr>
    <tr>
        <td>secret</td>
        <td class='hlayout'>
            <input type="text" class="flexgrow" bind:value={appsecret}
            oninput={() => Settings.set('weixinAppSecret', appsecret)} />
        </td>
    </tr>
    <tr>
        <td>stable token</td>
        <td>
            <input type="text" style="width: 100%" disabled 
                bind:value={stableToken} /><br/>
            <button style="width: 100%" 
                onclick={() => getToken()}>retrieve token</button>
        </td>
    </tr>
</tbody></table>
<button onclick={() => getAssetCount()}>get asset count</button>

<ListView header={listHeader} hin={listHandleIn} bind:hout={listHandleOut}>
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

