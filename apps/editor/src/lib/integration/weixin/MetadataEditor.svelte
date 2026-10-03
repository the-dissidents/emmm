<script lang="ts">
  import { ConfigRow } from '@the_dissidents/svelte-ui';
  import { FolderOpenIcon } from '@lucide/svelte';
  import { open } from '@tauri-apps/plugin-dialog';
  import { _ } from 'svelte-i18n';
  import { Workspace } from '$lib/workspace/Workspace.svelte';
  import { EmmmDocument } from '$lib/workspace/Document.svelte';
  import { Interface } from '$lib/Interface.svelte';
  import { getArticleInfo } from './Digest';
  import { articleMetadata } from './Fields';
  import { writeDocumentField, migrateDocumentMetadata } from './Document';

  const active = $derived(
    Workspace.active instanceof EmmmDocument ? Workspace.active : null
  );
  $effect(() => {
    if (active?.editor) migrateDocumentMetadata(active);
  });
  let defaults = $state({ title: '', author: '' });
  $effect(() => {
    const owner = active;
    const parsed = owner?.parseData?.data;
    defaults = { title: '', author: '' };
    if (parsed)
      getArticleInfo(parsed)
        .then((info) => {
          if (Workspace.active === owner && owner?.parseData?.data === parsed)
            defaults = info;
        })
        .catch(() => {});
  });
  const metadata = $derived(
    articleMetadata(
      active?.source ?? '',
      Interface.renderedDocument ?? document,
      defaults
    )
  );
  const rowStyle =
    'display: flex; align-items: center; gap: .3em; min-width: 0';

  async function chooseCover() {
    const owner = active;
    const selected = await open({
      multiple: false,
      filters: [{ name: 'Image', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
    });
    if (typeof selected === 'string' && Workspace.active === owner)
      writeDocumentField('wx-cover', 'file:' + selected);
  }
</script>

<ConfigRow name={$_('weixin.article.title')} style={rowStyle}>
  <input
    type="text"
    disabled={!active}
    value={metadata.title}
    onchange={(e) => writeDocumentField('wx-title', e.currentTarget.value)}
  />
</ConfigRow>
<ConfigRow name={$_('weixin.article.author')} style={rowStyle}>
  <input
    type="text"
    disabled={!active}
    value={metadata.author}
    onchange={(e) => writeDocumentField('wx-author', e.currentTarget.value)}
  />
</ConfigRow>
<ConfigRow name={$_('weixin.article.cover')} style={rowStyle}>
  <input
    type="text"
    disabled={!active}
    value={metadata.cover}
    onchange={(e) => writeDocumentField('wx-cover', e.currentTarget.value)}
  />
  <button
    disabled={!active}
    onclick={chooseCover}
    aria-label={$_('weixin.article.choose-cover')}><FolderOpenIcon /></button
  >
</ConfigRow>

<style>
  input {
    flex: 1;
    min-width: 0;
    width: 100%;
  }
  button {
    flex-shrink: 0;
  }
</style>
