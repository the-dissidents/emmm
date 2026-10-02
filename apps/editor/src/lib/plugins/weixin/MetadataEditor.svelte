<script lang="ts">
  import { ConfigRow, ConfigTable, Popup } from '@the_dissidents/svelte-ui';
  import { CropIcon, FolderOpenIcon } from '@lucide/svelte';
  import { open } from '@tauri-apps/plugin-dialog';
  import { Workspace } from '$lib/workspace/Workspace.svelte';
  import { Interface } from '$lib/Interface.svelte';
  import { articleMetadata, defaultCrops, type Crop } from './Fields';
  import { writeDocumentField } from './Document';
  import { imageBlob } from './Images';
  import CropPreview from './CropPreview.svelte';

  const source = $derived(Workspace.active?.source ?? '');
  const metadata = $derived(articleMetadata(source, Interface.renderedDocument ?? document));
  let cropPopup = $state<Popup>();
  let image = $state('');
  let wide = $state<Crop>([0,0,1,1]), square = $state<Crop>([0,0,1,1]);
  let error = $state('');
  let dimensions = $state({width: 0, height: 0});
  let imageVersion = 0;
  let lastCover = '';
  import { onDestroy } from 'svelte';
  onDestroy(() => { imageVersion++; if (image) URL.revokeObjectURL(image); });
  let busy = $state(false);

  $effect(() => {
    const url = metadata.cover;
    if (url === lastCover) return;
    lastCover = url;
    const version = ++imageVersion;
    if (!url) { image = ''; return; }
    busy = true;
    imageBlob(url).then(blob => {
      if (version !== imageVersion) return;
      const src = URL.createObjectURL(blob);
      if (image) URL.revokeObjectURL(image);
      image = src;
      error = '';
    }).catch(failure => { if (version === imageVersion) { error = String(failure); image = ''; } })
      .finally(() => { if (version === imageVersion) busy = false; });
  });

  $effect(() => {
    Workspace.active?.id;
    metadata.wide; metadata.square; metadata.dual;
    if (dimensions.width) {
      const crops = defaultCrops(dimensions.width, dimensions.height, metadata.dual);
      wide = metadata.wide ?? crops.wide; square = metadata.square ?? crops.square;
    }
  });

  function loaded(event: Event) {
    const img = event.currentTarget as HTMLImageElement;
    dimensions = {width: img.naturalWidth, height: img.naturalHeight};
    const crops = defaultCrops(dimensions.width, dimensions.height, metadata.dual);
    wide = metadata.wide ?? crops.wide; square = metadata.square ?? crops.square;
  }
  function updateCrop(which: 'wide' | 'square', value: Crop) {
    if (which === 'wide') wide = value; else square = value;
    writeDocumentField(`wx-crop-${which}`, value.map(x => x.toFixed(6)).join(','));
  }
  function changeMode(value: string) {
    writeDocumentField('wx-cover-mode', value);
    if (dimensions.width) {
      const crops = defaultCrops(dimensions.width, dimensions.height, value !== 'single');
      updateCrop('wide', crops.wide); updateCrop('square', crops.square);
    }
  }
  async function chooseCover() {
    const file = await open({ multiple: false, filters: [{name: '图片', extensions: ['png','jpg','jpeg','webp']}] });
    if (!file) return;
    writeDocumentField('wx-cover', 'file:' + file);
    writeDocumentField('wx-crop-wide', ''); writeDocumentField('wx-crop-square', '');
  }
</script>

<h5>微信文章</h5>
<ConfigTable>
  <ConfigRow name="标题"><input type="text" class="flexgrow" value={metadata.title} onchange={e => writeDocumentField('wx-title', e.currentTarget.value)} /></ConfigRow>
  <ConfigRow name="作者"><input type="text" class="flexgrow" maxlength="16" value={metadata.author} onchange={e => writeDocumentField('wx-author', e.currentTarget.value)} /></ConfigRow>
  <ConfigRow name="头图">
    <input type="text" class="flexgrow" value={metadata.cover} onchange={e => {
      writeDocumentField('wx-cover', e.currentTarget.value);
      writeDocumentField('wx-crop-wide', ''); writeDocumentField('wx-crop-square', '');
    }} />
    <button onclick={chooseCover} aria-label="选择头图"><FolderOpenIcon /></button>
    <button disabled={!image || busy} onclick={e => cropPopup?.open(e.currentTarget.getBoundingClientRect())} aria-label="裁切头图"><CropIcon /></button>
  </ConfigRow>
</ConfigTable>
{#if image}<img class="dimension-probe" src={image} alt="" onload={loaded} />{/if}
{#if error}<div role="alert">{error}</div>{/if}

<Popup bind:this={cropPopup} position="bottom" maxWidth="none">
  <ConfigTable><ConfigRow name="格式">
    <select value={metadata.dual ? 'dual' : 'single'} onchange={e => changeMode(e.currentTarget.value)}>
      <option value="dual">双图</option><option value="single">单图</option>
    </select>
  </ConfigRow></ConfigTable>
  <div class="hlayout crops">
    <CropPreview src={image} crop={wide} ratio={2.35} label="2.35:1" onchange={value => updateCrop('wide', value)} />
    <CropPreview src={image} crop={square} ratio={1} label="1:1" onchange={value => updateCrop('square', value)} />
  </div>
</Popup>

<style>
  .dimension-probe { display: none; }
  .crops { width: 380px; max-width: 80vw; gap: 12px; padding-top: 6px; }
</style>
