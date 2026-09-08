<script lang="ts">
  import CopyButton from '$/components/CopyButton.svelte';
  import { Input } from '$/components/ui/input';
  import type { InputType } from '$/types';
  import { copyToClipboard } from '$/util/util';

  let {
    value,
    label = 'Copy',
    type = 'url',
    testID,
    /** Set false when the copy action lives outside this row (e.g. a title-row icon button). */
    showCopy = true
  }: {
    value: string;
    label?: string;
    type?: InputType;
    testID?: string;
    showCopy?: boolean;
  } = $props();
</script>

<div class="flex w-full items-center gap-2">
  <Input
    {type}
    {value}
    data-testid={testID}
    onclick={(event) => {
      event.currentTarget.setSelectionRange(0, event.currentTarget.value.length);
    }} />

  {#if showCopy}
    <CopyButton onclick={() => copyToClipboard(value)} {label} />
  {/if}
</div>
