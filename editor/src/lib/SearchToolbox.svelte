<script lang="ts">
  let searchPattern = $state('');
  let replacement = $state('');
</script>

<div class="vlayout contain">

<h5>Search & Replace</h5>

<input type="text" placeholder="pattern" bind:value={searchPattern} />
<input type="text" placeholder="replace by" bind:value={replacement} />

</div>