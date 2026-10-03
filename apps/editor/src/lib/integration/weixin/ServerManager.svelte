<script lang="ts">
  import {
    ConfigRow,
    ConfigTable,
    Popup,
    showConfirmationPopup,
  } from '@the_dissidents/svelte-ui';
  import {
    PencilIcon,
    PlusIcon,
    Trash2Icon,
    LoaderIcon,
    FileKeyIcon,
  } from '@lucide/svelte';
  import { open } from '@tauri-apps/plugin-dialog';
  import { readTextFile } from '@tauri-apps/plugin-fs';
  import { _ } from 'svelte-i18n';
  import { weixinError } from './Errors';
  import {
    connection,
    proxies,
    saveProxy,
    deleteProxy,
    testProxy,
  } from './Connection';
  import { Memorized } from '$lib/config/Memorized.svelte';

  const { busy = false } = $props<{ busy?: boolean }>();
  let popup = $state<Popup>();
  let phase = $state<'idle' | 'saving' | 'testing' | 'ready' | 'error'>('idle');
  let error = $state('');
  let name = $state('');
  let endpoint = $state('');
  let username = $state('');
  let password = $state('');
  let certificate = $state('');
  let profileId = $state('');
  const current = $derived(
    $proxies.find((proxy) => proxy.id === $connection.profileId)
  );
  const rowStyle =
    'display: flex; align-items: center; gap: .4em; min-width: 0';
  const working = $derived(busy || phase === 'saving' || phase === 'testing');

  function edit(event: MouseEvent, create = false) {
    const proxy = create ? undefined : current;
    profileId = proxy?.id ?? crypto.randomUUID();
    name = proxy?.name ?? '';
    endpoint = proxy?.endpoint ?? '';
    username = proxy?.username ?? '';
    password = proxy?.password ?? '';
    certificate = proxy?.certificate ?? '';
    error = '';
    popup?.open((event.currentTarget as HTMLElement).getBoundingClientRect());
  }

  async function test() {
    if (!current) return;
    phase = 'testing';
    error = '';
    try {
      await testProxy(current.id);
      phase = 'ready';
    } catch (failure) {
      error = weixinError(failure);
      phase = 'error';
    }
  }

  async function save() {
    phase = 'saving';
    error = '';
    try {
      const proxy = await saveProxy({
        profileId,
        name: name.trim() || endpoint.trim(),
        serviceUrl: endpoint.trim(),
        username: username.trim(),
        password,
        certificate,
      });
      password = '';
      connection.set({ mode: 'relay', profileId: proxy.id });
      await Memorized.save();
      phase = 'idle';
      popup?.close();
      await test();
    } catch (failure) {
      error = weixinError(failure);
      phase = 'error';
    }
  }

  async function remove(event: MouseEvent) {
    if (
      !current ||
      !(await showConfirmationPopup(
        event.currentTarget as HTMLElement,
        $_('weixin.service.delete')
      ))
    )
      return;
    try {
      await deleteProxy(current.id);
      phase = 'idle';
      error = '';
    } catch (failure) {
      error = weixinError(failure);
      phase = 'error';
    }
  }

  async function importCertificate() {
    const file = await open({
      multiple: false,
      filters: [{ name: 'Certificate', extensions: ['pem', 'crt'] }],
    });
    if (typeof file === 'string') certificate = await readTextFile(file);
  }
</script>

<h5>{$_('weixin.service.label')}</h5>
<ConfigTable class="weixin-config">
  <ConfigRow name={$_('weixin.service.mode')} style={rowStyle}>
    <select
      value={$connection.mode}
      disabled={working}
      onchange={async (event) => {
        connection.set({
          ...$connection,
          mode: event.currentTarget.value === 'relay' ? 'relay' : 'direct',
        });
        phase = 'idle';
        error = '';
        await Memorized.save();
      }}
    >
      <option value="direct">{$_('weixin.service.direct')}</option>
      <option value="relay">{$_('weixin.service.relay')}</option>
    </select>
  </ConfigRow>
  {#if $connection.mode === 'relay'}
    <ConfigRow name={$_('weixin.service.server')} style={rowStyle}>
      <select
        disabled={working}
        value={$connection.profileId}
        onchange={async (event) => {
          connection.set({
            mode: 'relay',
            profileId: event.currentTarget.value,
          });
          phase = 'idle';
          error = '';
          await Memorized.save();
        }}
      >
        <option value="">{$_('weixin.service.unconfigured')}</option>
        {#each $proxies as proxy}<option value={proxy.id}>{proxy.name}</option
          >{/each}
      </select>
      <button
        disabled={working || !current}
        onclick={(event) => edit(event)}
        aria-label={$_('weixin.service.edit')}><PencilIcon /></button
      >
      <button
        disabled={working}
        onclick={(event) => edit(event, true)}
        aria-label={$_('weixin.service.add')}><PlusIcon /></button
      >
      <button
        disabled={working || !current}
        onclick={remove}
        aria-label={$_('weixin.service.delete')}><Trash2Icon /></button
      >
    </ConfigRow>
    <ConfigRow name={$_('weixin.service.status')} style={rowStyle}>
      <span class="connection-status" role="status"
        >{$_(
          !current ? 'weixin.service.unconfigured' : 'weixin.service.' + phase
        )}</span
      >
      <button disabled={working || !current} onclick={test}>
        {#if working}<LoaderIcon />{/if}{$_('weixin.service.test')}
      </button>
    </ConfigRow>
  {/if}
</ConfigTable>
{#if error}<div role="alert">{error}</div>{/if}

<Popup bind:this={popup} position="bottom" maxWidth="calc(100vw - 24px)">
  <div class="settings">
    <h5>{$_('weixin.service.edit')}</h5>
    <ConfigTable
      style="grid-template-columns: min-content max-content minmax(0, 1fr); align-items: center"
    >
      <ConfigRow name={$_('weixin.service.name')} style={rowStyle}
        ><input bind:value={name} disabled={working} /></ConfigRow
      >
      <ConfigRow name={$_('weixin.service.address')} style={rowStyle}
        ><input
          type="url"
          bind:value={endpoint}
          disabled={working}
          placeholder="https://"
        /></ConfigRow
      >
      <ConfigRow name={$_('weixin.service.username')} style={rowStyle}
        ><input
          bind:value={username}
          disabled={working}
          placeholder={$_('weixin.service.optional')}
          autocomplete="off"
        /></ConfigRow
      >
      <ConfigRow name={$_('weixin.service.password')} style={rowStyle}
        ><input
          type="text"
          bind:value={password}
          disabled={working || !username}
          autocomplete="off"
        /></ConfigRow
      >
    </ConfigTable>
    <details open={!!certificate}>
      <summary>{$_('weixin.service.custom-certificate')}</summary>
      <button
        class="certificate-button"
        disabled={working}
        onclick={importCertificate}
        ><FileKeyIcon />{$_('weixin.service.import-certificate')}</button
      >
      {#if certificate}
        <span>{$_('weixin.service.certificate-imported')}</span>
        <button disabled={working} onclick={() => (certificate = '')}
          >{$_('weixin.service.clear-certificate')}</button
        >
      {/if}
    </details>
    {#if error}<div role="alert">{error}</div>{/if}
    <div class="actions">
      <button disabled={working} onclick={() => popup?.close()}
        >{$_('weixin.network.cancel')}</button
      >
      <button
        class="veryimportant"
        disabled={working || !endpoint}
        onclick={save}
      >
        {#if working}<LoaderIcon />{/if}{$_('weixin.service.save')}
      </button>
    </div>
  </div>
</Popup>

<style>
  .settings {
    width: 360px;
    max-width: calc(100vw - 40px);
    display: flex;
    flex-direction: column;
    gap: 0.5em;
  }
  .certificate-button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.4em;
    width: 100%;
  }
  .certificate-button :global(.lucide) {
    margin: 0;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5em;
  }
  .actions button {
    min-width: 5em;
  }
  .connection-status {
    flex: 1;
    font-size: var(--label-font-size);
  }
  summary {
    cursor: pointer;
    font-size: var(--label-font-size);
    padding-block: 0.4em;
  }
  details button {
    margin-block: 0.4em;
  }
  input,
  select {
    flex: 1;
    min-width: 0;
    width: 100%;
  }
  button {
    flex-shrink: 0;
  }
  [role='alert'] {
    overflow-wrap: anywhere;
  }
</style>
