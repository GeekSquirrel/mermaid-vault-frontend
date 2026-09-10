<script lang="ts">
  import { Button } from '$/components/ui/button';
  import * as DropdownMenu from '$/components/ui/dropdown-menu';
  import type { PanZoomState, RenderEngineMode } from '$/util/panZoom';
  import RocketIcon from '~icons/material-symbols/rocket-launch-outline-rounded';
  import CanvasIcon from '~icons/material-symbols/photo-outline-rounded';
  import SvgIcon from '~icons/hugeicons/svg-02';
  import CheckIcon from '~icons/material-symbols/check-rounded';
  import { onMount } from 'svelte';

  let { panZoomState }: { panZoomState: PanZoomState } = $props();

  let activeMode = $state<RenderEngineMode>('standard');

  onMount(() => {
    activeMode = panZoomState.getEngineMode();
    panZoomState.onEngineChange = (mode) => {
      activeMode = mode;
    };
  });

  const selectMode = (mode: RenderEngineMode) => {
    activeMode = mode;
    panZoomState.setEngineMode(mode);
  };
</script>

<DropdownMenu.Root>
  <DropdownMenu.Trigger class="flex items-center">
    <Button variant="ghost" size="icon" title={`Rendering Engine: ${activeMode.toUpperCase()}`}>
      {#if activeMode === 'gpu'}
        <RocketIcon class="size-4 text-emerald-500 dark:text-emerald-400" />
      {:else if activeMode === 'canvas'}
        <CanvasIcon class="size-4 text-sky-500 dark:text-sky-400" />
      {:else}
        <SvgIcon class="size-4 opacity-75" />
      {/if}
    </Button>
  </DropdownMenu.Trigger>
  <DropdownMenu.Content align="start" class="w-64 p-1 shadow-lg">
    <div class="px-2 py-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
      Experimental Render Engine
    </div>
    <DropdownMenu.Separator />
    <DropdownMenu.Item
      class="flex cursor-pointer items-start gap-2.5 rounded-md p-2 transition-colors"
      onclick={() => selectMode('gpu')}>
      <div
        class="mt-0.5 flex size-5 items-center justify-center rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
        <RocketIcon class="size-4" />
      </div>
      <div class="flex flex-1 flex-col">
        <div class="flex items-center gap-1.5 text-sm font-medium">
          GPU Accelerated
          <span
            class="py-0.2 rounded bg-emerald-500/15 px-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
            Recommended
          </span>
        </div>
        <span class="text-xs text-muted-foreground">
          Hardware composited transform for 60~120 FPS buttery smooth drag & zoom.
        </span>
      </div>
      {#if activeMode === 'gpu'}
        <CheckIcon class="size-4 self-center text-emerald-500" />
      {/if}
    </DropdownMenu.Item>

    <DropdownMenu.Item
      class="flex cursor-pointer items-start gap-2.5 rounded-md p-2 transition-colors"
      onclick={() => selectMode('canvas')}>
      <div
        class="mt-0.5 flex size-5 items-center justify-center rounded bg-sky-500/10 text-sky-600 dark:text-sky-400">
        <CanvasIcon class="size-4" />
      </div>
      <div class="flex flex-1 flex-col">
        <div class="flex items-center gap-1.5 text-sm font-medium">
          Canvas 2D
          <span
            class="py-0.2 rounded bg-sky-500/15 px-1 text-[10px] font-semibold text-sky-600 dark:text-sky-400">
            Blit
          </span>
        </div>
        <span class="text-xs text-muted-foreground">
          HTML5 Canvas offscreen raster blitting for high node counts.
        </span>
      </div>
      {#if activeMode === 'canvas'}
        <CheckIcon class="size-4 self-center text-sky-500" />
      {/if}
    </DropdownMenu.Item>

    <DropdownMenu.Item
      class="flex cursor-pointer items-start gap-2.5 rounded-md p-2 transition-colors"
      onclick={() => selectMode('standard')}>
      <div
        class="mt-0.5 flex size-5 items-center justify-center rounded bg-muted text-muted-foreground">
        <SvgIcon class="size-4" />
      </div>
      <div class="flex flex-1 flex-col">
        <div class="text-sm font-medium">Standard SVG</div>
        <span class="text-xs text-muted-foreground">
          Default official svg-pan-zoom DOM engine.
        </span>
      </div>
      {#if activeMode === 'standard'}
        <CheckIcon class="size-4 self-center text-muted-foreground" />
      {/if}
    </DropdownMenu.Item>
  </DropdownMenu.Content>
</DropdownMenu.Root>
