<script lang="ts">
  import { onMount } from 'svelte';
  import { api, type PreviewTheme } from '$lib/services/api';
  import { sha256Hex } from '$lib/util/hash';
  import { previewPairMismatched } from '$lib/util/previewSvg';
  import { render } from '$lib/util/mermaid';
  import type { MermaidConfig } from 'mermaid';
  import { mode } from 'mode-watcher';
  import ErrorIcon from '~icons/material-symbols/error-outline-rounded';
  import LoadingIcon from '~icons/material-symbols/sync-rounded';

  let {
    code,
    id,
    previewKind
  }: { code: string; id: string; previewKind?: 'diagram' | 'bookmark' } = $props();

  let containerEl = $state<HTMLDivElement | null>(null);
  let error = $state<string | null>(null);
  let loading = $state(false);
  let svgContent = $state<string | null>(null);

  let visible = false;
  let generation = 0;

  const themeOf = (): PreviewTheme => (mode.current === 'dark' ? 'dark' : 'light');

  const themeConfigOf = (theme: PreviewTheme): MermaidConfig => ({
    securityLevel: 'loose',
    startOnLoad: false,
    theme: theme === 'dark' ? 'dark' : 'default'
  });

  const renderIdOf = (prefix: string) =>
    `${prefix}-${id.replace(/[^a-zA-Z0-9_-]/g, '')}-${Math.random().toString(36).substring(2, 7)}`;

  // Swaps the SVG in place so the container layout never shifts. Deliberately
  // no opacity animation here: animating the preview promotes it to its own
  // compositing layer, and for cards clipped by the viewport edge Chromium
  // re-rasters tiles mid-animation, showing a distorted frame (curves
  // flattening). The page-level theme crossfade already masks the swap.
  const injectSvg = (node: HTMLDivElement, content: string | null) => {
    node.innerHTML = content ?? '';
    return {
      update(nextContent: string | null) {
        node.innerHTML = nextContent ?? '';
      }
    };
  };

  // Per-diagram cache of both themes' preview SVGs. Theme flips apply the
  // cached SVG synchronously (before any await in loadFlow) so the swap lands
  // inside the page transition's update callback: the captured "new" state is
  // atomic, keeping the crossfade free of mid-animation content mutations
  // (which misraster cards clipped by the viewport edge).
  let cache: { code: string; svgs: Partial<Record<PreviewTheme, string>> } = {
    code: '',
    svgs: {}
  };

  const otherThemeOf = (theme: PreviewTheme): PreviewTheme => (theme === 'dark' ? 'light' : 'dark');

  const fetchStored = (theme: PreviewTheme): Promise<string | null> => {
    if (previewKind === 'diagram') {
      return api.getDiagramPreview(id, theme);
    }
    if (previewKind === 'bookmark') {
      return api.getBookmarkPreview(id, theme);
    }
    return Promise.resolve(null);
  };

  /** Pre-fetches the counterpart theme's stored preview into the cache. */
  const warmCache = (gen: number, theme: PreviewTheme): void => {
    const otherTheme = otherThemeOf(theme);
    if (cache.svgs[otherTheme]) {
      return;
    }
    fetchStored(otherTheme)
      .then((stored) => {
        if (gen === generation && stored && !cache.svgs[otherTheme]) {
          cache.svgs[otherTheme] = stored;
        }
      })
      .catch(() => {
        // Cache stays single-theme; the next toggle fetches on demand
      });
  };

  /**
   * Load the preview for the current theme: in-memory cache, then stored
   * server-side SVG, then live client rendering with server backfill. A
   * generation counter discards results from superseded runs (theme flips,
   * re-entries) so stale async results never overwrite newer ones.
   *
   * Mermaid geometry depends on the font metrics of the rendering
   * environment, so stored light/dark previews uploaded by different
   * environments (machines, the server renderer) have different intrinsic
   * sizes and visibly jump when swapped. When a stored preview disagrees
   * with the one on screen, it is skipped and re-rendered locally; as both
   * themes get visited, the stored pair converges to one environment.
   */
  const loadFlow = async () => {
    const gen = ++generation;
    if (!code?.trim()) {
      error = null;
      loading = false;
      svgContent = null;
      return;
    }
    // The diagram was edited: cached previews are stale by definition.
    if (cache.code !== code) {
      cache = { code, svgs: {} };
    }

    const theme = themeOf();
    const cached = cache.svgs[theme];
    if (cached && !previewPairMismatched(svgContent, cached)) {
      error = null;
      loading = false;
      svgContent = cached;
      return;
    }

    loading = true;
    error = null;

    if (previewKind) {
      try {
        const stored = await fetchStored(theme);
        if (gen !== generation) return;
        // A stored preview rendered in a different environment than the one
        // currently on screen would visibly shift when swapped in; skip it
        // so the live render below replaces it.
        if (stored && !previewPairMismatched(svgContent, stored)) {
          cache.svgs[theme] = stored;
          svgContent = stored;
          loading = false;
          warmCache(gen, theme);
          return;
        }
      } catch {
        // Server preview unavailable — fall through to live rendering
      }
    }

    try {
      const res = await render(themeConfigOf(theme), code, renderIdOf('preview'));
      if (gen !== generation) return;
      cache.svgs[theme] = res.svg;
      svgContent = res.svg;
      loading = false;

      // Backfill the server preview for this theme so future visits skip
      // live rendering. Fire-and-forget; failures are silently ignored.
      if (previewKind) {
        const codeHash = await sha256Hex(code);
        if (gen === generation && codeHash) {
          const dto = { theme, codeHash, svg: res.svg };
          void (previewKind === 'diagram'
            ? api.uploadDiagramPreview(id, dto)
            : api.uploadBookmarkPreview(id, dto));
        }
      }
    } catch (err) {
      if (gen !== generation) return;
      error = err instanceof Error ? err.message : 'Syntax error';
      svgContent = null;
      loading = false;
    }
  };

  onMount(() => {
    if (!containerEl) return;
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) {
      visible = true;
      void loadFlow();
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          observer.disconnect();
          visible = true;
          void loadFlow();
        }
      },
      { rootMargin: '150px' }
    );

    observer.observe(containerEl);

    return () => {
      observer.disconnect();
    };
  });

  // Re-load when the color mode flips so previews match the active theme.
  $effect(() => {
    void mode.current;
    if (visible) {
      void loadFlow();
    }
  });
</script>

<div
  bind:this={containerEl}
  class="relative flex size-full items-center justify-center overflow-hidden rounded-md border border-border/40 bg-muted/20 p-2">
  {#if !code?.trim()}
    <span class="text-xs text-muted-foreground italic">(Empty diagram)</span>
  {:else if error}
    <div
      class="flex size-full flex-col items-center justify-center gap-1.5 overflow-hidden rounded bg-destructive/10 p-3 text-center text-xs text-destructive">
      <ErrorIcon class="size-5 shrink-0" />
      <span class="font-semibold">Syntax error</span>
      <span class="line-clamp-3 font-mono text-[11px] text-destructive/80">
        {error}
      </span>
    </div>
  {:else if loading && !svgContent}
    <div class="flex items-center gap-1.5 text-xs text-muted-foreground">
      <LoadingIcon class="size-4 animate-spin" />
      <span>Rendering preview...</span>
    </div>
  {/if}

  <div
    use:injectSvg={svgContent}
    class={[
      'pointer-events-none flex size-full items-center justify-center overflow-hidden [&>svg]:h-auto [&>svg]:max-h-full [&>svg]:w-auto [&>svg]:max-w-full [&>svg]:object-contain',
      !svgContent && 'hidden'
    ]}>
  </div>

  {#if !svgContent && !error && !loading && code?.trim()}
    <div class="size-full animate-pulse bg-muted/10"></div>
  {/if}
</div>
