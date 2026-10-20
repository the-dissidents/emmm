<script lang="ts">
  import { ConfigRow, ConfigTable, Popup, showConfirmationPopup, showInputPopup } from "@the_dissidents/svelte-ui";
  import { EllipsisIcon } from "@lucide/svelte";
  import { hook } from "$lib/details/Hook.svelte";
  import { Memorized } from "$lib/config/Memorized.svelte";
  import { _ } from 'svelte-i18n';
  import { ReverseProxyClient } from "./ProxyClient.svelte";
  import { Debug } from "$lib/Debug";
  import { menu } from "@tauri-apps/api";

  interface Props {
    proxy?: ReverseProxyClient,
    onChange?: (a: ReverseProxyClient | undefined) => void
  }

  let { proxy = $bindable(), onChange }: Props = $props();

  let div = $state<HTMLElement>();
  let popup = $state<Popup>();
  let change = $state(0);

  let nameInput = $state(proxy?.name ?? '');
  let invalid = $derived(proxy && nameInput
    && proxy.name !== nameInput && ReverseProxyClient.getNames().includes(nameInput));

  hook(() => proxy?.name, (v) => nameInput = v);

  Memorized.onInitialize(() => change++);
</script>

<div class="hlayout" bind:this={div}>
{#key change}
  <select class="flexgrow"
      bind:value={() => proxy?.name, (v) => {
        proxy = v ? new ReverseProxyClient(v) : undefined;
        onChange?.(proxy);
      }}>
    <option value={undefined}>{$_('weixin.proxy.no-proxy')}</option>
    {#each ReverseProxyClient.getNames() as name}
      <option value={name}>{name}</option>
    {/each}
  </select>

  <button onclick={async () => {
    (await menu.Menu.new({ items: [
      {
        text: $_('weixin.proxy.add'),
        action: async () => {
          const name = await showInputPopup(div!, $_('account.proxy-name'), {
            validate: (name) => name !== '' && !ReverseProxyClient.getNames().includes(name)
          });
          if (!name) return;
          proxy = new ReverseProxyClient(name);
          onChange?.(proxy);
          change++;
          popup?.open({...div!.getBoundingClientRect()});
        }
      }, {
        text: $_('weixin.proxy.modify'),
        enabled: !!proxy,
        action: () => popup?.open(div!.getBoundingClientRect())
      }, {
        item: 'Separator'
      }, {
        text: $_('weixin.proxy.delete'),
        enabled: !!proxy,
        action: async () => {
          if (!await showConfirmationPopup(div!, $_('account.delete-proxy'))) return;
          Debug.assert(!!proxy);
          ReverseProxyClient.delete(proxy.name);
          proxy = undefined;
          onChange?.(proxy);
          change++;
        }
      }
    ] })).popup();
  }}>
    <EllipsisIcon />
  </button>
{/key}
</div>

<Popup bind:this={popup} position="bottom" maxWidth="none">
  {#key change}
  {#if proxy}
  <ConfigTable>
    <ConfigRow name={$_('account.name')}>
      <input type="text" class="flexgrow"
        class:invalid={invalid}
        bind:value={nameInput}
        onchange={() => {
          Debug.assert(!!proxy);
          if (invalid) {
            nameInput = proxy.name;
          } else {
            proxy.rename(nameInput);
            onChange?.(proxy);
            change++;
          }
        }}
      />
      <hr>
    </ConfigRow>
    <ConfigRow name={$_('account.url')}>
      <input type="text" class="flexgrow"
        bind:value={() => proxy!.url, (x) => proxy!.url = x} />
    </ConfigRow>
    <ConfigRow name={$_('account.authentication')}>
      <select bind:value={() => proxy!.credential.type, (x) => {
            Debug.assert(!!proxy);
            if (x == proxy.credential.type) return;
            switch (x) {
              case 'none':
                proxy.credential = { type: 'none' };
                break;
              case 'basic':
                proxy.credential = { type: 'basic', username: '', password: '' };
                break;
              default:
                Debug.never(x);
            }
          }}>
        <option value="none">{$_('weixin.proxy.no-auth')}</option>
        <option value="basic">{$_('weixin.proxy.basic-auth')}</option>
      </select>
    </ConfigRow>
    {#if proxy.credential.type == 'basic'}
    <ConfigRow name={$_('weixin.proxy.username')}>
      <input type="text" class="flexgrow"
        bind:value={() => {
          Debug.assert(proxy!.credential.type == 'basic');
          return proxy!.credential.username;
        }, (x) => {
          Debug.assert(proxy!.credential.type == 'basic');
          proxy!.credential.username = x;
        }} />
    </ConfigRow>
    <ConfigRow name={$_('weixin.proxy.password')}>
      <input type="text" class="flexgrow"
        bind:value={() => {
          Debug.assert(proxy!.credential.type == 'basic');
          return proxy!.credential.password;
        }, (x) => {
          Debug.assert(proxy!.credential.type == 'basic');
          proxy!.credential.password = x;
        }} />
    </ConfigRow>
    {/if}
  </ConfigTable>
  {/if}
  {/key}
</Popup>

<style>
  .hlayout {
    min-height: auto;
  }
  .invalid {
    background-color: pink;
  }

  hr {
    margin-block: 5px 2px;
  }
</style>
