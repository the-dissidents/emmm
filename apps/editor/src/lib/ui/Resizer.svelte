<script lang="ts">
  interface Props {
    first?: HTMLElement,
    second?: HTMLElement | null,
    vertical?: boolean,
    reverse?: boolean,
    minValue?: number,
    stretch?: boolean
  };

  let { 
    first, second = null, 
    vertical = false, reverse = false, 
    minValue = 100, stretch = false 
  }: Props = $props();

  let cx = 0, cy = 0, orig = 0, orig2 = 0;
  let dragging = $state(false);

  function createOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'drag-overlay';
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.zIndex = '9999'; // Ensure it's on top of everything
    overlay.style.backgroundColor = 'transparent'; // Fully transparent
    document.body.appendChild(overlay);
  }

  function removeOverlay() {
    const overlay = document.getElementById('drag-overlay');
    if (overlay) {
      document.body.removeChild(overlay);
    }
  }
</script>

<svelte:document
  on:mousemove={(ev) => {
    if (!first) return;
    if (dragging) {
      let f = reverse ? -1 : 1;
      if (vertical) {
        let val = Math.max(orig + (ev.clientX - cx) * f, minValue);
        if (second) second.style.width = orig2 + val - orig + "px";
        first.style.width = val + "px";
      } else {
        let val = Math.max(orig + (ev.clientY - cy) * f, minValue);
        if (second) second.style.height = orig2 + val - orig + "px";
        first.style.height = val + "px";
      }
    }
  }}
  on:mouseup={() => {
    if (dragging) {
      dragging = false;
      removeOverlay();
    }
  }}
/>
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class={[vertical ? "resizerV" : "resizerH", stretch && (vertical ? 'stretchY' : 'stretchX')]}
  style="cursor: {vertical ? 'ew-resize' : 'ns-resize'}"
  onmousedown={(ev) => {
    if (!first) return;
    cx = ev.clientX;
    cy = ev.clientY;
    orig = vertical ? first.offsetWidth : first.offsetHeight;
    if (second) {
      orig2 = vertical ? second.offsetWidth : second.offsetHeight;
    }
    dragging = true;
    createOverlay();
  }}
>
  <div class={["inside flexgrow", dragging && 'active']}></div>
</div>

<style>
  .resizerH {
    height: 3px;
    padding: 0 2px;
    user-select: none;
    -webkit-user-select: none;
    -moz-user-select: none;
    -ms-user-select: none;
    display: flex;
    flex-flow: row;
  }

  .resizerH .inside {
    height: 1px;
    background-color: gray;
    transform: translateY(50%);
    transition: all 0.1s ease-out;
  }

  .resizerH:hover .inside, .resizerH .inside.active {
    height: 3px;
    background-color: palevioletred;
    transform: translateY(-25%);
  }

  .resizerV {
    width: 3px;
    padding: 2px 0;
    text-align: center;
    user-select: none;
    -webkit-user-select: none;
    -moz-user-select: none;
    -ms-user-select: none;
    display: flex;
    flex-flow: column;
  }

  .resizerV .inside {
    display: inline-block;
    /* height: 100%; */
    width: 1px;
    background-color: gray;
    transform: translateX(50%);
    transition: all 0.1s ease-out;
  }

  .resizerV:hover .inside, .resizerV .inside.active {
    width: 3px;
    background-color: palevioletred;
    transform: translateX(-25%);
  }

  .stretchX { width: 100%; }
  .stretchY { height: 100%; }
</style>
