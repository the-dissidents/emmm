<script lang="ts">
  import { ConfigRow, ConfigTable, Popup, showConfirmationPopup, showInputPopup } from "@the_dissidents/svelte-ui";
  import { WeixinClient } from "./API.svelte";
  import { PencilIcon, Trash2Icon, UserPlusIcon } from "@lucide/svelte";
  import { hook } from "$lib/details/Hook.svelte";
  import { Memorized } from "$lib/config/Memorized.svelte";
  import { _ } from 'svelte-i18n';

  interface Props {
    account: WeixinClient,
    onChange?: (a: WeixinClient) => void
  }

  let { account = $bindable(), onChange }: Props = $props();

  let div = $state<HTMLElement>();
  let popup = $state<Popup>();
  let change = $state(0);

  let nameInput = $state(account.name);
  let invalid = $derived(nameInput == ''
    || account.name !== nameInput && WeixinClient.getNames().includes(nameInput));

  hook(() => account.name, (v) => nameInput = v);

  Memorized.onInitialize(() => change++);
</script>

<div class="hlayout" bind:this={div}>
{#key change}
  <select class="flexgrow"
      value={account.name}
      onchange={(e) => {
        account = new WeixinClient(e.currentTarget.value);
        onChange?.(account);
      }}>
    {#each WeixinClient.getNames() as name}
      <option value={name}>{name}</option>
    {/each}
  </select>
  <button onclick={() => {
    popup?.open(div!.getBoundingClientRect());
  }}>
    <PencilIcon />
  </button>
  <button onclick={async (e) => {
    const name = await showInputPopup(e.currentTarget, $_('account.account-name'), {
      validate: (name) => name !== '' && !WeixinClient.getNames().includes(name)
    });
    if (!name) return;
    account = new WeixinClient(name);
    onChange?.(account);
    change++;
    popup?.open({...div!.getBoundingClientRect()});
  }}>
    <UserPlusIcon />
  </button>
  <button onclick={async (e) => {
    if (!await showConfirmationPopup(e.currentTarget, $_('account.delete-account'))) return;
    const newName = WeixinClient.getNames().find((x) => x != account.name) ?? 'default';
    account.deleteAndSwitch(newName);
    onChange?.(account);
    change++;
  }} disabled={WeixinClient.getNames().length <= 1}>
    <Trash2Icon />
  </button>
{/key}
</div>

<Popup bind:this={popup} position="bottom" maxWidth="none">
  {#key change}
  <ConfigTable>
    <ConfigRow name={$_('account.name')}>
      <input type="text" class="flexgrow"
        class:invalid={invalid}
        bind:value={nameInput}
        onchange={() => {
          if (invalid) {
            nameInput = account.name;
          } else {
            account.rename(nameInput);
            onChange?.(account);
            change++;
          }
        }}
      />
      <hr>
    </ConfigRow>
    <ConfigRow name={$_('account.appid')}>
      <input type="text" class="flexgrow"
        bind:value={() => account.appid, (x) => account.appid = x} />
    </ConfigRow>
    <ConfigRow name={$_('account.secret')}>
      <input type="text" class="flexgrow"
        bind:value={() => account.secret, (x) => account.secret = x} />
    </ConfigRow>
  </ConfigTable>
  {/key}
</Popup>

<style>
  .hlayout {
    min-height: auto;
  }
  .invalid {
    background-color: pink;
  }
</style>
