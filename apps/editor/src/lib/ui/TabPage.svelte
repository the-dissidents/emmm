<script lang="ts">
  import { getContext, type Snippet } from "svelte";
  import { TabAPIContext, type TabAPI, type TabPageData } from "./TabView.svelte";
  import { writable } from "svelte/store";

  interface Props {
    name: string;
    active?: boolean;
    removeIfInactive?: boolean;
    onActivate?: () => void;
    children?: Snippet;
  }

  let {
    name = $bindable(),
    active = $bindable(false),
    removeIfInactive,
    onActivate,
    children
  }: Props = $props();

  const tabApi: TabAPI = getContext(TabAPIContext);
  const writableName = writable(name);
  const page: TabPageData = {name: writableName}
  const id = Symbol();

  tabApi.registerPage(id, page);
  const selection = tabApi.selected();

  $effect(() => { writableName.set(name); });
  $effect(() => { if (active) {
    selection.set(id);
    onActivate?.();
  }});

  selection.subscribe((x) => { active = x === id; });
</script>

<div class='page flexgrow' class:active>
  {#if !removeIfInactive || active}
    {@render children?.()}
  {/if}
</div>

<style>
.page {
  padding-top: 2px;
  flex: 1 0;
  overflow-x: hidden;
  overflow-y: auto;
  display: none;
}
.active {
  display: block;
}
</style>
