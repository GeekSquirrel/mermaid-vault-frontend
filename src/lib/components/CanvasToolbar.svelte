<script lang="ts">
  import type { Snippet } from 'svelte';
  import FloatingToolbar from '$/components/FloatingToolbar.svelte';
  import { Button } from '$/components/ui/button';
  import { Separator } from '$/components/ui/separator';
  import type { PanZoomState } from '$/util/panZoom';
  import BookmarkAddIcon from '~icons/material-symbols/bookmark-add-outline-rounded';
  import ExpandIcon from '~icons/material-symbols/open-in-full-rounded';
  import SaveIcon from '~icons/material-symbols/save-outline-rounded';
  import ArrowsToCircleIcon from '~icons/material-symbols/screenshot-frame-2';
  import MagnifyingGlassMinusIcon from '~icons/material-symbols/zoom-out';
  import MagnifyingGlassPlusIcon from '~icons/material-symbols/zoom-in';
  import PerformanceToggle from '$/components/PerformanceToggle.svelte';

  let {
    /** Embed/narrow frames: keep zoom buttons visible below the `sm` breakpoint. */
    compact = false,
    fullScreenHref,
    /** Extra controls rendered at the far left, before the save/bookmark actions. */
    leading,
    onBookmark,
    onSave,
    panZoomState
  }: {
    compact?: boolean;
    /** When set, shows a "Full Screen" button linking here. Omit for store-free embeds. */
    fullScreenHref?: string;
    leading?: Snippet;
    onBookmark?: () => void;
    onSave?: () => void;
    panZoomState: PanZoomState;
  } = $props();

  const zoomClass = $derived(compact ? undefined : 'hidden sm:block');
</script>

<FloatingToolbar>
  {#if leading}
    {@render leading()}
    <Separator orientation="vertical" class="h-5 min-h-0 w-px border-0 bg-current opacity-30" />
  {/if}
  {#if onSave}
    <Button variant="ghost" size="icon" title="Save diagram" onclick={onSave}>
      <SaveIcon class="size-4" />
    </Button>
  {/if}
  {#if onBookmark}
    <Button variant="ghost" size="icon" title="Bookmark diagram state" onclick={onBookmark}>
      <BookmarkAddIcon class="size-4" />
    </Button>
  {/if}
  {#if onSave || onBookmark}
    <Separator orientation="vertical" class="h-5 min-h-0 w-px border-0 bg-current opacity-30" />
  {/if}
  <Button variant="ghost" size="icon" title="Reset view" onclick={() => panZoomState.reset()}>
    <ArrowsToCircleIcon />
  </Button>
  <Button
    variant="ghost"
    size="icon"
    class={zoomClass}
    title="Zoom out"
    onclick={() => panZoomState.zoomOut()}>
    <MagnifyingGlassMinusIcon />
  </Button>
  <Button
    variant="ghost"
    size="icon"
    class={zoomClass}
    title="Zoom in"
    onclick={() => panZoomState.zoomIn()}>
    <MagnifyingGlassPlusIcon />
  </Button>
  <Separator orientation="vertical" class="h-5 min-h-0 w-px border-0 bg-current opacity-30" />
  <PerformanceToggle {panZoomState} />
  {#if fullScreenHref}
    <Separator orientation="vertical" class="h-5 min-h-0 w-px border-0 bg-current opacity-30" />
    <Button variant="ghost" size="icon" title="Full Screen" href={fullScreenHref} target="_blank">
      <ExpandIcon />
    </Button>
  {/if}
</FloatingToolbar>
