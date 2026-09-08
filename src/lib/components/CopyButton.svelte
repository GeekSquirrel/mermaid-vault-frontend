<script lang="ts">
  import { Button } from '$/components/ui/button';
  import { notify } from '$/util/notify';
  import { scale } from 'svelte/transition';
  import CheckIcon from '~icons/material-symbols/check-rounded';
  import CopyIcon from '~icons/material-symbols/content-copy-outline-rounded';

  let {
    onclick,
    label = 'Copy',
    /** Icon-only rendering for title rows; the label becomes the tooltip. */
    iconOnly = false
  }: {
    onclick: (event?: Event) => Promise<unknown>;
    label?: string;
    iconOnly?: boolean;
  } = $props();

  let showCheckIcon = $state(false);
</script>

<Button
  size={iconOnly ? 'icon' : 'default'}
  variant="default"
  title={iconOnly ? label : undefined}
  onclick={async (event) => {
    try {
      showCheckIcon = true;
      setTimeout(() => {
        showCheckIcon = false;
      }, 1000);
      await onclick(event);
    } catch {
      notify('Failed to copy');
    }
  }}>
  <div class="grid">
    {#key showCheckIcon}
      <span transition:scale class="col-start-1 row-start-1">
        {#if showCheckIcon}
          <CheckIcon />
        {:else}
          <CopyIcon />
        {/if}
      </span>
    {/key}
  </div>
  {#if !iconOnly}
    {label}
  {/if}
</Button>
