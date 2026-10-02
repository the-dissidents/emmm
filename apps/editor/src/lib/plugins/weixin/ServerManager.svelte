<script lang="ts">
  import { get } from 'svelte/store';
  import { _ } from 'svelte-i18n';
  import { FolderOpenIcon, PencilIcon, PlusIcon, Trash2Icon } from '@lucide/svelte';
  import { ConfigRow, ConfigTable, Popup, showConfirmationPopup, showInputPopup } from '@the_dissidents/svelte-ui';
  import { open } from '@tauri-apps/plugin-dialog';
  import { weixinNetwork } from './Network';
  import { weixinServers, serversReady, saveWeixinServers, type WeixinServer } from './Servers';

  let { busy = false }: { busy?: boolean } = $props();
  let bar = $state<HTMLElement>();
  let popup = $state<Popup>();
  let draft = $state<WeixinServer | null>(null);
  let error = $state('');
  let saves = Promise.resolve();
  const selected = $derived($weixinServers.find(server => server.id === $weixinNetwork.sshServer));
  const invalid = $derived(!!draft && (!draft.name.trim()
    || $weixinServers.some(server => server.id !== draft!.id && server.name === draft!.name)));

  $effect(() => {
    if ($serversReady && $weixinServers.length && !selected)
      $weixinNetwork.sshServer = $weixinServers[0].id;
  });

  function edit() {
    error = '';
    draft = selected ? { ...selected, hostKeys: [...selected.hostKeys] } : null;
    popup?.open(bar!.getBoundingClientRect());
  }

  async function add(event: MouseEvent) {
    const name = await showInputPopup(event.currentTarget as HTMLElement, $_('weixin.network.name'), {
      validate: name => !!name.trim() && !get(weixinServers).some(server => server.name === name.trim()),
    });
    if (!name) return;
    const server: WeixinServer = { id: crypto.randomUUID(), name: name.trim(), host: '',
      username: 'root', sshPort: 22, identityFile: '', hostKeys: [] };
    await saveWeixinServers([...get(weixinServers), server]);
    $weixinNetwork.sshServer = server.id;
    draft = { ...server };
    popup?.open(bar!.getBoundingClientRect());
  }

  function save() {
    if (!draft || invalid || !Number.isInteger(draft.sshPort) || draft.sshPort < 1 || draft.sshPort > 65535) return;
    const server = { ...draft, name: draft.name.trim(), host: draft.host.trim(),
      username: draft.username.trim(), identityFile: draft.identityFile.trim() };
    saves = saves.then(async () => {
      const servers = get(weixinServers);
      const original = servers.find(item => item.id === server.id);
      if (!original) return;
      if (original.host !== server.host || original.sshPort !== server.sshPort) server.hostKeys = [];
      await saveWeixinServers(servers.map(item => item.id === server.id ? server : item));
    }).catch(failure => { error = String(failure); });
  }

  async function remove(event: MouseEvent) {
    if (!selected || !await showConfirmationPopup(event.currentTarget as HTMLElement, $_('weixin.network.delete'))) return;
    await saves;
    try {
      const others = get(weixinServers).filter(server => server.id !== selected.id);
      await saveWeixinServers(others);
      $weixinNetwork.sshServer = others[0]?.id ?? '';
      if (!others.length) $weixinNetwork.mode = 'direct';
    } catch (failure) { error = String(failure); }
  }

  async function chooseKey() {
    const file = await open({ multiple: false, directory: false });
    if (file && draft) { draft.identityFile = file; save(); }
  }
</script>

<ConfigTable><ConfigRow name={$_('weixin.network.forwarding')}>
  <div class="hlayout server-bar" bind:this={bar}>
    <input type="checkbox" disabled={busy}
      bind:checked={() => $weixinNetwork.mode === 'ssh', enabled => $weixinNetwork.mode = enabled ? 'ssh' : 'direct'} />
    <select class="flexgrow" aria-label={$_('weixin.network.server')}
      bind:value={$weixinNetwork.sshServer} disabled={busy || !$weixinServers.length}>
      {#each $weixinServers as server}<option value={server.id}>{server.name}</option>{/each}
    </select>
    <button onclick={edit} disabled={busy || !selected} aria-label={$_('weixin.network.edit')}><PencilIcon /></button>
    <button onclick={add} disabled={busy} aria-label={$_('weixin.network.add')}><PlusIcon /></button>
    <button onclick={remove} disabled={busy || !selected} aria-label={$_('weixin.network.delete')}><Trash2Icon /></button>
  </div>
</ConfigRow></ConfigTable>

<Popup bind:this={popup} position="bottom" maxWidth="none" onclose={save}>
  {#if draft}
  <form onchange={save} onsubmit={event => event.preventDefault()}>
    <ConfigTable>
      <ConfigRow name={$_('weixin.network.name')}><input type="text" class="flexgrow" class:invalid bind:value={draft.name} /></ConfigRow>
      <ConfigRow name={$_('weixin.network.host')}><input type="text" class="flexgrow" bind:value={draft.host} /></ConfigRow>
      <ConfigRow name={$_('weixin.network.port')}><input type="number" min="1" max="65535" class="flexgrow" bind:value={draft.sshPort} /></ConfigRow>
      <ConfigRow name={$_('weixin.network.username')}><input type="text" class="flexgrow" bind:value={draft.username} /></ConfigRow>
      <ConfigRow name={$_('weixin.network.key')}>
        <input type="text" class="flexgrow" bind:value={draft.identityFile} />
        <button type="button" onclick={chooseKey} aria-label={$_('weixin.network.choose-key')}><FolderOpenIcon /></button>
      </ConfigRow>
    </ConfigTable>
  </form>
  {/if}
  {#if error}<div role="alert">{error}</div>{/if}
</Popup>

<style>
  .server-bar { min-height: auto; align-items: center; }
  .server-bar select { min-width: 0; width: 0; }
  input[type='checkbox'], button { flex-shrink: 0; }
  .invalid { background-color: pink; }
</style>
