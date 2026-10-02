<script lang="ts">
  import type { Crop } from './Fields';
  let { src, crop, ratio, label, onchange }: {
    src: string, crop: Crop, ratio: number, label: string, onchange?: (crop: Crop) => void,
  } = $props();
  const width = $derived(crop[2] - crop[0]);
  const height = $derived(crop[3] - crop[1]);
  function move(axis: 'x' | 'y', value: number) {
    if (axis === 'x') onchange?.([value, crop[1], value + width, crop[3]]);
    else onchange?.([crop[0], value, crop[2], value + height]);
  }
</script>
<div class="crop" style:flex={ratio}>
  <div class="image" style:aspect-ratio={ratio}>
    <img {src} alt={label} style:width={`${100 / width}%`} style:height={`${100 / height}%`}
      style:left={`${-crop[0] / width * 100}%`} style:top={`${-crop[1] / height * 100}%`} />
  </div>
  <span>{label}</span>
  {#if onchange}
    <input aria-label={`${label} 横向裁切`} type="range" min="0" max={Math.max(0, 1 - width)} step="0.001" value={crop[0]}
      disabled={width >= 0.999} oninput={e => move('x', Number(e.currentTarget.value))} />
    <input aria-label={`${label} 纵向裁切`} type="range" min="0" max={Math.max(0, 1 - height)} step="0.001" value={crop[1]}
      disabled={height >= 0.999} oninput={e => move('y', Number(e.currentTarget.value))} />
  {/if}
</div>
<style>
  .crop { flex: 1; min-width: 0; text-align: center; }
  .image { position: relative; overflow: hidden; background: var(--page-background-medium); }
  img { position: absolute; max-width: none; object-fit: fill; }
  span { font-size: 0.85rem; }
  input { width: 100%; display: block; }
</style>
