<script lang="ts">
  import Manager from '$lib/plugins/weixin/ServerManager.svelte';
  let { busy = false }: { busy?: boolean } = $props();
</script>
<Manager {busy} />
