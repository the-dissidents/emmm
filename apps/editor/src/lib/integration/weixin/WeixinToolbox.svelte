<script lang="ts">
  import { assert, Debug } from '../../Debug';
  import ServerManager from './ServerManager.svelte';
  import { connection, connectionKey } from './Connection';
  import MetadataEditor from './MetadataEditor.svelte';
  import {
    saveArticleDraft,
    uploadDraftImages,
    DraftSyncError,
  } from './Drafts';
  import { getArticleInfo } from './Digest';
  import { resolveImageURL } from './Images';
  import { EmmmDocument } from '$lib/workspace/Document.svelte';
  import { Workspace } from '$lib/workspace/Workspace.svelte';
  import { getIP, GetIPMethod } from '../../Util';
  import { WeixinClient } from './API.svelte';
  import { guardAsync, Interface } from '../../Interface.svelte';
  import { type ProgressReporter } from '../../Util';
  import { postprocess, prerender } from './Postprocess';
  import { RustAPI, type FileHash } from '$lib/RustAPI';

  import * as clipboard from '@tauri-apps/plugin-clipboard-manager';
  import * as dialog from '@tauri-apps/plugin-dialog';
  import * as z from 'zod/v4-mini';
  import { ZArticleColors } from '$lib/ColorTheme';

  import {
    ConfigRow,
    ConfigTable,
    ListView,
    Tooltip,
  } from '@the_dissidents/svelte-ui';
  import {
    CheckIcon,
    CircleArrowUpIcon,
    CircleXIcon,
    GlobeIcon,
    LoaderIcon,
    TriangleAlertIcon,
  } from '@lucide/svelte';
  import AccountManager from './AccountManager.svelte';
  import { Memorized } from '$lib/config/Memorized.svelte';
  import { _ } from 'svelte-i18n';
  import { weixinError } from './Errors';
  import { DebouncedTask } from '$lib/details/DebouncedTask';

  let publicIP = $state('');
  let draftBusy = $state(false);
  let networkBusy = $state(false);
  let networkError = $state('');
  async function testNetwork() {
    networkBusy = true;
    networkError = '';
    try {
      publicIP = await getIP(GetIPMethod.ipinfo);
    } catch (error) {
      networkError = weixinError(error);
    } finally {
      networkBusy = false;
    }
  }

  let accountName = Memorized.$('weixin-account-name', z.string(), 'default');
  let client = $state(new WeixinClient());
  let token = $derived(client.stableToken);
  let accountStatus = $derived(client.connectionStatus);

  let progress = Interface.progress;
  const backgroundImage = Interface.backgroundImage;

  Memorized.onInitialize(() => {
    client = new WeixinClient($accountName);
  });

  type ImgStatus =
    'uploaded' | 'external' | 'notUploaded' | 'invalid' | 'error' | 'pending';
  type Img = {
    status: ImgStatus;
    hash?: FileHash;
    url: URL;
  };
  let sourceImgs: Img[] = $state([]);

  const defaultReporter: ProgressReporter = (x, total) =>
    ($progress = x / total);

  async function uploadImg(img: Img) {
    Interface.status.set(
      $_('weixin.msg.compressing', { values: { url: img.url.href } })
    );

    const uploaded = await guardAsync(
      async () => {
        Debug.assert(!!img.hash);
        const file = await RustAPI.compressImage(img.url, 1024 * 1024);
        const url = new URL(img.url);
        if (!url.href.toLowerCase().endsWith('.' + file.ext))
          url.href += '.' + file.ext;
        Interface.status.set(
          $_('weixin.msg.uploading', { values: { path: url.pathname } })
        );
        await client.uploadSmallImage(file.blob, url.href, img.hash, true);
        await updateImgStatus(img);
        Interface.status.set($_('weixin.msg.done'));
        return true;
      },
      $_('weixin.msg.error-uploading', { values: { url: img.url.href } }),
      false
    );
    if (!uploaded) img.status = 'error';
  }

  async function uploadAllImages(report: ProgressReporter = defaultReporter) {
    const total = sourceImgs.filter((x) => x.status == 'notUploaded').length;
    if (total == 0) return;

    let p = 0;
    report(0, total);
    for (const img of sourceImgs) {
      if (img.status == 'notUploaded') {
        await uploadImg(img);
        p++;
        report(p, total);
      }
    }
    Interface.status.set(
      $_('weixin.msg.uploaded-images', {
        values: { count: total, s: total == 1 ? '' : 's' },
      })
    );
  }

  async function updateImgStatus(img: Img) {
    img.status = 'pending';
    if (!img.hash) img.hash = await RustAPI.hashFile(img.url);
    if (await WeixinClient.getSmallImageCacheUrl(img.hash, client.appid)) {
      img.status = 'uploaded';
    } else if (img.url.protocol !== 'file:') {
      img.status = 'external';
    } else {
      img.status = 'notUploaded';
    }
  }

  const updateImgList = new DebouncedTask(async () => {
    let doc = Interface.frame?.contentDocument;
    assert(doc !== undefined && doc !== null);
    sourceImgs = [];

    const promises: Promise<void>[] = [];

    if ($backgroundImage) {
      const img: Img = $state({
        status: 'pending',
        url: new URL(await resolveImageURL($backgroundImage)),
      });
      promises.push(updateImgStatus(img));
      sourceImgs.push(img);
    }

    for (const x of [...doc.querySelectorAll('img')]) {
      try {
        const url = new URL(x.dataset.originalSrc ?? x.src);
        let img: Img = $state({ status: 'pending', url });
        sourceImgs.push(img);
        if (x.complete && x.naturalWidth > 0) {
          promises.push(updateImgStatus(img));
        } else if (x.complete) {
          img.status = 'invalid';
        }
      } catch (_) {}
    }
    await Promise.allSettled(promises);
  }, 500);

  async function doPrerender(report: ProgressReporter = defaultReporter) {
    const doc = Interface.frame?.contentDocument;
    const win = Interface.frame?.contentWindow;
    if (!doc || !win) return;

    const result = await guardAsync(
      () => prerender(win, doc, report),
      $_('weixin.msg.error-prerender'),
      undefined
    );
    if (result) {
      const { success, total } = result;
      if (total == 0)
        Interface.status.set($_('weixin.msg.nothing-to-prerender'));
      else if (success == total)
        Interface.status.set(
          $_('weixin.msg.prerendered', { values: { success } })
        );
      else
        Interface.status.set(
          $_('weixin.msg.prerendered-failed', {
            values: { success, failed: total - success },
          })
        );
    }
    updateImgList.start();
  }

  async function copyResult(html = true) {
    const doc = Interface.frame?.contentDocument;
    const win = Interface.frame?.contentWindow;
    if (!doc || !win) return;
    if (!Interface.isCurrentPreview()) {
      networkError = $_('weixin.drafts.not-ready');
      return;
    }
    if (doc.querySelector('[data-weixin-history-error]')) {
      networkError = $_('weixin.drafts.not-ready');
      return;
    }
    const { result, notCached } = await postprocess(doc, win, client.appid);
    if (notCached) {
      networkError = $_('weixin.drafts.not-ready');
      return;
    }
    await (html ? clipboard.writeHtml(result) : clipboard.writeText(result));
    if (notCached > 0) {
      Interface.status.set(
        $_('weixin.msg.warning-not-uploaded', { values: { count: notCached } })
      );
    } else {
      Interface.status.set($_('weixin.msg.copied-weixin'));
    }
  }

  const me = {};
  Interface.onFrameLoaded.bind(me, () => updateImgList.start());

  let mode = Memorized.$(
    'weixin-mode',
    z.enum(['manual', 'automatic']),
    'manual'
  );

  let lastSuccess = $state('');
  let draftIssue = $state<DraftSyncError>();
  $effect(() => {
    Workspace.active;
    client;
    client.appid;
    $connection;
    lastSuccess = '';
    draftIssue = undefined;
  });

  function snapshot() {
    const active = Workspace.active;
    if (!(active instanceof EmmmDocument))
      throw new DraftSyncError('open-article');
    const currentClient = client;
    const appid = client.appid;
    const accountRevision = client.revision;
    const route = connectionKey();
    const source = active.source;
    const path = active.path;
    const mojikit = Interface.useMojikit.get();
    const library = Workspace.library.source;
    const stylesheet = Workspace.stylesheet.source;
    const assets = Workspace.assetPath;
    const background = Interface.backgroundImage.get();
    const colors = JSON.stringify(
      z.encode(ZArticleColors, Interface.colors.get())
    );
    return {
      active,
      currentClient,
      source,
      background,
      validate() {
        if (
          Workspace.active !== active ||
          active.source !== source ||
          active.path !== path ||
          Interface.useMojikit.get() !== mojikit ||
          client !== currentClient ||
          client.appid !== appid ||
          client.revision !== accountRevision ||
          connectionKey() !== route ||
          Workspace.library.source !== library ||
          Workspace.stylesheet.source !== stylesheet ||
          Workspace.assetPath !== assets ||
          Interface.backgroundImage.get() !== background ||
          JSON.stringify(z.encode(ZArticleColors, Interface.colors.get())) !==
            colors
        )
          throw new DraftSyncError('changed');
      },
    };
  }

  async function prepare(report: ProgressReporter) {
    const operation = snapshot();
    await operation.currentClient.ensureAccount();
    operation.validate();
    if (!(await Interface.render())) throw new DraftSyncError('not-ready');
    operation.validate();
    const doc = Interface.frame?.contentDocument;
    const win = Interface.frame?.contentWindow;
    if (!doc || !win || doc.querySelector('[data-weixin-history-error]'))
      throw new DraftSyncError('not-ready');
    const result = await prerender(win, doc, report, true);
    if (result.success !== result.total) throw new DraftSyncError('not-ready');
    await uploadDraftImages(
      operation.currentClient,
      doc,
      operation.background ? await resolveImageURL(operation.background) : '',
      report
    );
    operation.validate();
    if (
      Interface.frame?.contentDocument !== doc ||
      !Interface.isCurrentPreview()
    )
      throw new DraftSyncError('changed');
    const output = await postprocess(doc, win, operation.currentClient.appid);
    operation.validate();
    if (
      Interface.frame?.contentDocument !== doc ||
      !Interface.isCurrentPreview()
    )
      throw new DraftSyncError('changed');
    if (output.notCached) throw new DraftSyncError('not-ready');
    return { ...operation, doc, output };
  }

  async function doAuto(report: ProgressReporter = defaultReporter) {
    if (draftBusy) return;
    draftBusy = true;
    networkError = '';
    try {
      const prepared = await prepare(report);
      prepared.validate();
      await clipboard.writeHtml(prepared.output.result);
      Interface.status.set($_('weixin.msg.copied-weixin'));
    } catch (error) {
      networkError = weixinError(error);
    } finally {
      draftBusy = false;
      $progress = undefined;
      updateImgList.start();
    }
  }

  async function saveDraft(
    resolution?: 'overwrite' | 'new',
    report: ProgressReporter = defaultReporter
  ) {
    if (draftBusy) return;
    draftBusy = true;
    networkError = '';
    draftIssue = undefined;
    try {
      const prepared = await prepare(report);
      const parsed = prepared.active.parseData?.data;
      if (!parsed) throw new DraftSyncError('not-ready');
      const info = await getArticleInfo(parsed);
      prepared.validate();
      const saved = await saveArticleDraft({
        client: prepared.currentClient,
        source: prepared.source,
        doc: prepared.doc,
        key: prepared.active.path ?? prepared.active.id,
        temporaryKey: prepared.active.id,
        content: prepared.output.result,
        notCached: prepared.output.notCached,
        digest: info.digest,
        defaults: info,
        validate: prepared.validate,
        resolution,
      });
      prepared.validate();
      lastSuccess = new Date().toLocaleTimeString();
      Interface.status.set(
        $_(
          saved.unchanged
            ? 'weixin.drafts.unchanged'
            : saved.updated
              ? 'weixin.drafts.updated'
              : 'weixin.drafts.created'
        )
      );
    } catch (error) {
      if (error instanceof DraftSyncError) draftIssue = error;
      networkError = weixinError(error);
      Interface.status.set(networkError);
    } finally {
      draftBusy = false;
      $progress = undefined;
      updateImgList.start();
    }
  }

  async function resolveDraft(resolution: 'overwrite' | 'new') {
    if (await dialog.ask($_(`weixin.drafts.confirm-${resolution}`)))
      await saveDraft(resolution);
  }
</script>

<div class="weixin-panel vlayout vfill">
  <h5>{$_('weixin.credentials')}</h5>
  <AccountManager
    busy={draftBusy || networkBusy}
    bind:account={client}
    onChange={(a) => ($accountName = a.name)}
  />

  <ServerManager busy={draftBusy || networkBusy} />

  {#if networkError}<div role="alert">{networkError}</div>{/if}
  <ConfigTable class="weixin-config">
    {#if $connection.mode === 'direct'}
      <ConfigRow
        name={$_('weixin.public-ip')}
        style="display: flex; align-items: center; gap: .3em; min-width: 0"
      >
        <input
          type="text"
          class="flexgrow"
          style="min-width: 0; width: 100%"
          readonly
          value={publicIP}
        />
        <button
          class="network-action"
          disabled={networkBusy || draftBusy}
          onclick={testNetwork}
        >
          {#if networkBusy}<LoaderIcon />{:else}{$_('weixin.get')}{/if}
        </button>
      </ConfigRow>
    {/if}
    <ConfigRow
      name={$_(
        $connection.mode === 'relay'
          ? 'weixin.service.account-status'
          : 'weixin.stable-token'
      )}
      style="display: flex; align-items: center; gap: .4em; min-width: 0"
    >
      {#if $connection.mode === 'relay'}
        <span class="account-status" role="status">
          {$_(
            $accountStatus.ready && client.tokenOk
              ? 'weixin.service.ready'
              : 'weixin.service.account-idle'
          )}
        </span>
      {:else}
        <input
          type="text"
          class="flexgrow"
          style="min-width: 0; width: 100%"
          readonly
          value={$token}
        />
      {/if}
      <button
        class="network-action"
        disabled={networkBusy || draftBusy}
        onclick={async () => {
          networkBusy = true;
          networkError = '';
          try {
            await client.ensureAccount();
          } catch (error) {
            networkError = weixinError(error);
          } finally {
            networkBusy = false;
          }
        }}
        >{#if networkBusy}<LoaderIcon />{/if}{$_(
          $connection.mode === 'relay'
            ? 'weixin.service.connect-account'
            : 'weixin.retrieve-token'
        )}</button
      >
    </ConfigRow>
  </ConfigTable>

  <h5>{$_('weixin.article.label')}</h5>
  <ConfigTable class="weixin-config">
    <MetadataEditor />
  </ConfigTable>

  <h5>{$_('weixin.output')}</h5>

  <ConfigTable>
    <ConfigRow name={$_('weixin.mode')}>
      <label>
        <input
          type="checkbox"
          class="button"
          bind:checked={
            () => $mode == 'automatic',
            (x) => ($mode = x ? 'automatic' : 'manual')
          }
        />
        {$_('weixin.mode-' + $mode)}
      </label>
    </ConfigRow>
  </ConfigTable>

  <button class="veryimportant" disabled={draftBusy} onclick={() => saveDraft()}
    >{$_('weixin.drafts.sync')}</button
  >

  {#if $mode == 'manual'}
    <button
      disabled={draftBusy}
      onclick={() => doPrerender()}
      class="veryimportant">{$_('weixin.prerender')}</button
    >
    <button
      disabled={draftBusy}
      onclick={() => copyResult(true)}
      class="veryimportant"
    >
      {$_('weixin.copy-weixin')}
    </button>
    <button
      disabled={draftBusy}
      onclick={() => copyResult(false)}
      class="important"
    >
      {$_('weixin.copy-text')}
    </button>
    <hr />
    <button
      disabled={draftBusy}
      onclick={() => uploadAllImages()}
      class="veryimportant">{$_('weixin.upload-images')}</button
    >
  {:else}
    <button onclick={() => doAuto()} disabled={draftBusy} class="important">
      {$_('weixin.render-and-copy')}
    </button>
  {/if}

  {#if draftBusy}<div role="status">
      <LoaderIcon />{$_('weixin.drafts.preparing')}
    </div>{/if}
  {#if lastSuccess}<div>
      {$_('weixin.drafts.last-success', { values: { time: lastSuccess } })}
    </div>{/if}
  {#if draftIssue?.code === 'conflict'}
    <button onclick={() => resolveDraft('overwrite')}
      >{$_('weixin.drafts.overwrite')}</button
    >
  {/if}
  {#if draftIssue && ['missing', 'conflict', 'uncertain'].includes(draftIssue.code)}
    <button onclick={() => resolveDraft('new')}
      >{$_('weixin.drafts.new')}</button
    >
  {/if}

  <ListView
    style="min-height: 150px; flex-grow: 1; margin-top: .5em;"
    items={sourceImgs}
    columns={[
      ['button', { header: '', align: 'end', width: 'auto' }],
      ['status', { header: '', width: 'auto' }],
      ['name', { header: $_('weixin.name'), ellipsis: true, width: '1fr' }],
    ]}
  >
    {#snippet name(item)}
      {decodeURIComponent(item.url.href.split('/').at(-1)!)}
    {/snippet}
    {#snippet button(item)}
      {#if item.status == 'external'}
        <button disabled={draftBusy} onclick={() => uploadImg(item)}>
          {$_('weixin.force')}
        </button>
      {:else if item.status == 'notUploaded'}
        <button disabled={draftBusy} onclick={() => uploadImg(item)}>
          {$_('weixin.upload')}
        </button>
      {:else if item.status == 'uploaded'}
        <button disabled={draftBusy} onclick={() => uploadImg(item)}>
          {$_('weixin.reupload')}
        </button>
      {:else if item.status == 'error'}
        <button disabled={draftBusy} onclick={() => uploadImg(item)}>
          {$_('weixin.retry')}
        </button>
      {/if}
    {/snippet}
    {#snippet status(item)}
      {#if item.status == 'error'}
        <Tooltip position="right" text={$_('weixin.tooltip.error')}>
          <span><TriangleAlertIcon /></span>
        </Tooltip>
      {:else if item.status == 'invalid'}
        <Tooltip position="right" text={$_('weixin.tooltip.invalid')}>
          <span><CircleXIcon /></span>
        </Tooltip>
      {:else if item.status == 'external'}
        <Tooltip position="right" text={$_('weixin.tooltip.external')}>
          <span><GlobeIcon /></span>
        </Tooltip>
      {:else if item.status == 'notUploaded'}
        <Tooltip position="right" text={$_('weixin.tooltip.not-uploaded')}>
          <span><CircleArrowUpIcon /></span>
        </Tooltip>
      {:else if item.status == 'uploaded'}
        <Tooltip position="right" text={$_('weixin.tooltip.uploaded')}>
          <span><CheckIcon /></span>
        </Tooltip>
      {:else if item.status == 'pending'}
        <Tooltip position="right" text={$_('weixin.tooltip.pending')}>
          <span><LoaderIcon /></span>
        </Tooltip>
      {:else}
        {Debug.never(item.status)}
      {/if}
    {/snippet}
  </ListView>

  <hr />
</div>

<style>
  .weixin-panel {
    overflow-y: auto;
  }

  .weixin-panel :global(.weixin-config) {
    grid-template-columns: min-content calc(4 * var(--label-font-size)) minmax(
        0,
        1fr
      );
    align-items: center;
  }

  .weixin-panel :global(.weixin-config > .value) {
    min-width: 0;
  }

  .account-status {
    flex: 1;
    font-size: var(--label-font-size);
  }

  button {
    margin-bottom: 5px;
  }

  .network-action {
    flex-shrink: 0;
    margin: 0;
  }

  hr {
    margin-block: 5px;
    padding: 0;
  }

  label {
    width: 100%;
  }
</style>
