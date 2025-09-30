<script lang="ts">
    import type { Extension } from "@codemirror/state";
    import { onMount, type Snippet } from "svelte";
    import { setEditorContext } from "./Editor.svelte";

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