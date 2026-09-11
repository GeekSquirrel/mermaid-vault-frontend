<script lang="ts">
  import View from '$/components/View.svelte';
  import { initHandler, loadStateFromURL } from '$/util/util';
  import { onMount } from 'svelte';
  // Apply the URL-hash state synchronously before the view mounts, so the
  // first (and only) render already shows the shared diagram instead of
  // rendering stale code first and replacing it a moment later.
  if (typeof window !== 'undefined') {
    loadStateFromURL();
  }
  onMount(initHandler);
</script>

<svelte:head>
  <meta name="robots" content="noindex" />
</svelte:head>

<View shouldShowGrid={false} />
