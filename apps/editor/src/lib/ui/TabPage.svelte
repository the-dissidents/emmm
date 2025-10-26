<script lang="ts">
  import { getContext } from "svelte";
  import { TabAPIContext, type TabAPI, type TabPageData } from "./TabView.svelte";
  import { writable, get } from "svelte/store";

  interface Props {
      name: string;
      active?: boolean;
      onActivate?: () => void;
      children?: import('svelte').Snippet;
  }

  let {
      name = $bindable(),
      active = $bindable(false),
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
{@render children?.()}
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
