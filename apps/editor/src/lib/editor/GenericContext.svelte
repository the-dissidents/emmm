<script lang="ts">
    import type { Extension } from "@codemirror/state";
    import { type Snippet } from "svelte";
    import { setEditorContext } from "./Editor.svelte";

    interface Props {
        extension: Extension,
        children: Snippet;
    };

    let { extension, children }: Props = $props();

    setEditorContext({
      // svelte-ignore state_referenced_locally
      extensions: extension
    });
</script>

{@render children()}
