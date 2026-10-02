<script lang="ts">
  import { ConfigRow, ConfigTable, Popup } from '@the_dissidents/svelte-ui';
  import { FolderOpenIcon, PencilIcon } from '@lucide/svelte';
  import { tick, onMount } from 'svelte';
  import { open } from '@tauri-apps/plugin-dialog';
  import { Workspace } from '$lib/workspace/Workspace.svelte';
  import { Interface } from '$lib/Interface.svelte';
  import { field, articleMetadata, historyEnabled } from './Fields';
  import { writeDocumentField } from './Document';
  import { getHistory, importedFooter } from './History';

  const source = $derived(Workspace.active?.source ?? '');
  const spec = $derived(field(source, 'wx-history') ?? '');
  const htmlFile = $derived(field(source, 'wx-history-html') ?? '');
  const enabled = $derived(historyEnabled(source));
  let popup = $state<Popup>();
  let popupBody = $state<HTMLDivElement>();
  let editButton = $state<HTMLButtonElement>();
  let link = $state('');
  let count = $state(3);
  let mode = $state('link');
  let error = $state('');
  let busy = $state(false);

  async function edit(event: MouseEvent) {
    mode = htmlFile ? 'html' : spec.startsWith('api:') ? 'api' : 'link';
    count = spec.startsWith('api:') ? Number(spec.slice(4)) : 3;
    link = mode === 'html' ? htmlFile : mode === 'link' ? spec : '';
    error = '';
    const anchor = (event.currentTarget as HTMLElement).getBoundingClientRect();
    popup?.open(anchor);
    await tick();
    fitPopup();
  }
  function fitPopup() {
    const anchor = editButton?.getBoundingClientRect();
    const rect = popupBody?.parentElement?.getBoundingClientRect();
    if (!rect || !anchor) return;
    const margin = 12;
    const left = Math.max(margin, Math.min(anchor.right - rect.width, innerWidth - rect.width - margin));
    const below = anchor.bottom + 5;
    const top = below + rect.height <= innerHeight - margin ? below
      : Math.max(margin, Math.min(anchor.top - rect.height - 5, innerHeight - rect.height - margin));
    popup?.openAt(left, top);
  }
  onMount(() => {
    const observer = new ResizeObserver(() => { if (popup?.openState()) fitPopup(); });
    if (popupBody) observer.observe(popupBody);
    return () => observer.disconnect();
  });
  async function generate(visible = false) {
    busy = true; error = '';
    const active = Workspace.active;
    try {
      if (mode === 'html') await importedFooter(link);
      else {
        const value = mode === 'api' ? `api:${count}` : link;
        const title = articleMetadata(active?.source ?? '', Interface.renderedDocument ?? document).title;
        await getHistory(value, title, true, visible);
      }
      if (Workspace.active !== active) throw new Error('文章已切换');
      if (mode === 'html') {
        writeDocumentField('wx-history-html', link); writeDocumentField('wx-history', '');
      } else {
        writeDocumentField('wx-history', mode === 'api' ? `api:${count}` : link);
        writeDocumentField('wx-history-html', '');
      }
      writeDocumentField('wx-history-enabled', 'true');
      Interface.requestRender();
      popup?.close();
    } catch (failure) { error = failure instanceof Error ? failure.message : String(failure); }
    finally { busy = false; }
  }
  async function importHTML() {
    const path = await open({ multiple: false, filters: [{name: 'HTML', extensions: ['html','htm']}] });
    if (path) { mode = 'html'; link = 'file:' + path; }
  }
</script>

<svelte:window onresize={() => { if (popup?.openState()) fitPopup(); }} />

<ConfigTable><ConfigRow name="往期回顾">
  <input type="checkbox" checked={enabled}
    onchange={e => writeDocumentField('wx-history-enabled', String(e.currentTarget.checked))} />
  <input type="text" class="flexgrow" readonly value={htmlFile ? 'HTML' : spec.startsWith('api:') ? `最近 ${spec.slice(4)} 期` : spec ? '文章链接' : ''} />
  <button bind:this={editButton} onclick={edit} disabled={busy} aria-label="编辑往期回顾"><PencilIcon /></button>
</ConfigRow></ConfigTable>

<Popup bind:this={popup} position="bottom" maxWidth="calc(100vw - 24px)">
  <div bind:this={popupBody} class="history-editor">
    <div class="fields">
      <ConfigTable>
        <ConfigRow name="来源"><select bind:value={mode} disabled={busy}>
          <option value="api">公众号接口</option><option value="link">文章链接</option><option value="html">HTML</option>
        </select></ConfigRow>
        {#if mode === 'api'}
          <ConfigRow name="期数"><input type="number" min="1" max="10" bind:value={count} disabled={busy} /></ConfigRow>
        {:else}
          <ConfigRow name={mode === 'html' ? '文件' : '链接'}>
            <input type="text" class="flexgrow" bind:value={link} disabled={busy} />
            {#if mode === 'html'}<button onclick={importHTML} disabled={busy} aria-label="导入文末"><FolderOpenIcon /></button>{/if}
          </ConfigRow>
        {/if}
      </ConfigTable>
    </div>
    <button class="veryimportant" onclick={() => generate()} disabled={busy}>生成</button>
    {#if error}<div class="error" role="alert">{error}</div>{/if}
    {#if mode === 'link' && /微信.*验证/.test(error)}
      <button onclick={() => generate(true)} disabled={busy}>浏览器验证</button>
    {/if}
  </div>
</Popup>

<style>
  .history-editor { width: 320px; max-width: calc(100vw - 40px); max-height: calc(100vh - 40px); display: flex; flex-direction: column; gap: 6px; }
  .fields { overflow: auto; min-height: 0; }
  .history-editor :global(input), .history-editor :global(select) { min-width: 0; }
  .history-editor > button { flex-shrink: 0; }
  .error { overflow: auto; overflow-wrap: anywhere; max-height: 90px; }
</style>
