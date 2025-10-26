<script lang="ts">
  import type { Extension } from "@codemirror/state";
  import { type Snippet } from "svelte";
  import { setEditorContext } from "$lib/components";

  interface Props {
      extension: Extension,
      children: Snippet;
  };

  let { extension, children }: Props = $props();

  setEditorContext({
      extensions: extension
  });
</script>

{@render children()}
