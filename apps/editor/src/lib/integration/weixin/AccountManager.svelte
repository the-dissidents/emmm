<script lang="ts">
  import { ConfigRow, ConfigTable, Popup, showInputPopup } from "@the_dissidents/svelte-ui";
  import { WeixinClient } from "./API.svelte";
  import { PencilIcon, UserPlusIcon } from "@lucide/svelte";
  import { hook } from "$lib/details/Hook.svelte";
  import { Memorized } from "$lib/config/Memorized.svelte";

  interface Props {
    account: WeixinClient
  }

  let { account = $bindable() }: Props = $props();

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
        }}>
      {#each WeixinClient.getNames() as name}
        <option value={name}>{name}</option>
      {/each}
    </select>
  {/key}
  <button onclick={() => {
    popup?.open(div!.getBoundingClientRect());
  }}>
    <PencilIcon />
  </button>
  <button onclick={async (e) => {
    const name = await showInputPopup(e.currentTarget, "Account name", {
      validate: (name) => name !== '' && !WeixinClient.getNames().includes(name)
    });
    if (!name) return;
    account = new WeixinClient(name);
    change++;
    popup?.open({...div!.getBoundingClientRect()});
  }}>
    <UserPlusIcon />
  </button>
</div>

<Popup bind:this={popup} position="bottom" maxWidth="none">
  {#key change}
  <ConfigTable>
    <ConfigRow name="name">
      <input type="text" class="flexgrow"
        class:invalid={invalid}
        bind:value={nameInput}
        onchange={() => {
          if (invalid) nameInput = account.name;
          else account.rename(nameInput);
        }}
      />
      <hr>
    </ConfigRow>
    <ConfigRow name="appid">
      <input type="text" class="flexgrow"
        bind:value={() => account.appid, (x) => account.appid = x} />
    </ConfigRow>
    <ConfigRow name="secret">
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
</style>
