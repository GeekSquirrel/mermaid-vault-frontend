<script lang="ts">
  import Card from '$/components/Card/Card.svelte';
  import Editor from '$/components/Editor.svelte';
  import SamplesPanel from '$/components/SamplesPanel.svelte';
  import Bookmarks from '$/components/History/Bookmarks.svelte';
  import Timeline from '$/components/History/Timeline.svelte';
  import {
    addManualEntry,
    loadSavedEntries,
    setCurrentDiagramId,
    startAutoSave
  } from '$/components/History/historyState.svelte';
  import { afterNavigate } from '$app/navigation';
  import EditorChooserModal from '$/components/migration/EditorChooserModal.svelte';
  import Navbar from '$/components/Navbar.svelte';
  import CanvasToolbar from '$/components/CanvasToolbar.svelte';
  import Share from '$/components/Share.svelte';
  import StyleToggles from '$/components/StyleToggles.svelte';
  import { Button } from '$/components/ui/button';
  import * as Resizable from '$/components/ui/resizable';
  import VersionSecurityToolbar from '$/components/VersionSecurityToolbar.svelte';
  import View from '$/components/View.svelte';
  import { shouldShowEditorChooser } from '$/util/migration/domainMigration';
  import { PanZoomState } from '$/util/panZoom';
  import { diagramState } from '$/util/diagramState.svelte';
  import {
    initURLSubscription,
    resetInputForPendingLoad,
    validatedState,
    urls,
    inputState,
    verifyState
  } from '$/util/state.svelte';
  import { logEvent } from '$/util/stats';
  import { initHandler } from '$/util/util';
  import { onMount, tick } from 'svelte';
  import CodeIcon from '~icons/custom/code';
  import BookmarkIcon from '~icons/material-symbols/bookmark-outline-rounded';
  import HistoryIcon from '~icons/material-symbols/history';
  import ShareIcon from '~icons/material-symbols/share';
  import ShapesIcon from '~icons/material-symbols/account-tree-outline-rounded';
  import EditIcon from '~icons/material-symbols/edit-outline-rounded';
  import ViewIcon from '~icons/material-symbols/visibility-outline-rounded';
  import { historyState, setMode } from '$/components/History/historyState.svelte';

  const panZoomState = new PanZoomState();

  let activeEditorTab = $state<'code' | 'samples'>('code');
  let editorContainerRef = $state<HTMLDivElement>();

  const handleWindowPointerDown = (event: PointerEvent) => {
    if (!editorContainerRef) return;
    const target = event.target as Node | null;
    const isInsideEditor =
      target &&
      (editorContainerRef.contains(target) ||
        (target instanceof Element &&
          Boolean(
            target.closest('.monaco-editor') ||
            target.closest('.monaco-menu-container') ||
            target.closest('.cm-editor') ||
            target.closest('.cm-tooltip')
          )));

    if (isInsideEditor) {
      return;
    }

    const activeEl = document.activeElement as HTMLElement | null;
    if (
      activeEl &&
      (editorContainerRef.contains(activeEl) ||
        activeEl.closest('.monaco-editor') ||
        activeEl.closest('.cm-editor'))
    ) {
      activeEl.blur();
    }

    if (diagramState.hasChanges) {
      void diagramState.save();
    }
  };

  let width = $state(typeof window !== 'undefined' ? window.innerWidth : 0);
  let isMobile = $derived(
    width > 0 ? width < 768 : typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );
  let isViewMode = $state(true);
  let showEditorChooser = $state(false);
  // With ?id= the diagram comes from the backend: boot defers all
  // render-pipeline work until the fetch resolves, so the stale state
  // persisted in localStorage is never validated or rendered. The View stays
  // unmounted until then and mounts directly with the fetched diagram.
  const urlHasDiagramId =
    typeof window !== 'undefined' && Boolean(new URLSearchParams(window.location.search).get('id'));
  let initialLoadDone = $state(!urlHasDiagramId);
  if (urlHasDiagramId) {
    // Blank the persisted state synchronously at component construction —
    // before any child (the lazily imported code editor) can mount and
    // display it, so not even a single frame of the previous diagram's code
    // can appear while the fetch is in flight.
    resetInputForPendingLoad();
  }

  $effect(() => {
    if (isMobile && isViewMode) {
      void tick().then(() => {
        panZoomState.resize();
      });
    }
  });

  onMount(async () => {
    const savedPanelWidth = Number(localStorage.getItem(PANEL_WIDTH_KEY));
    if (savedPanelWidth >= PANEL_MIN_WIDTH) {
      panelWidth = Math.min(savedPanelWidth, PANEL_MAX_WIDTH);
    }
    await initHandler({ deferRender: urlHasDiagramId });
    showEditorChooser = shouldShowEditorChooser();
    window.addEventListener('appinstalled', () => {
      logEvent('pwaInstalled', { isMobile });
    });
  });

  afterNavigate(async () => {
    // window.location (not the navigation argument): ssr=false keeps this
    // client-only, and the URL is already updated when afterNavigate runs.
    const hasId = Boolean(new URLSearchParams(window.location.search).get('id'));
    if (hasId) {
      // Clear the canvas until this diagram's data arrives, so a previously
      // opened diagram is never left on screen while switching.
      initialLoadDone = false;
    }
    await diagramState.loadFromUrl();
    if (hasId) {
      // The fetched state is in place: start mirroring it into the URL hash
      // and restore the pan/zoom flag. The render kick itself happened inside
      // loadFromUrl → updateCode.
      initURLSubscription();
      verifyState();
    }
    initialLoadDone = true;
    setCurrentDiagramId(diagramState.id);
  });

  $effect(() => {
    void inputState.code;
    diagramState.notifyChange();
  });

  $effect(() => {
    setCurrentDiagramId(diagramState.id);
  });

  // Record the Timeline for the whole session and load saved history from backend
  onMount(() => {
    void loadSavedEntries();
    return startAutoSave();
  });

  const handleSaveDiagram = async () => {
    await diagramState.save();
  };

  const handleBookmarkDiagram = () => {
    const currentId = diagramState.id;
    setCurrentDiagramId(currentId);
    const currentState = $state.snapshot(inputState);
    const title = diagramState.title?.trim();
    addManualEntry(currentState, title || undefined, currentId);
  };

  let activePanel = $state<'bookmarks' | 'timeline' | 'share' | null>(null);

  const toggleBookmarks = () => {
    activePanel = activePanel === 'bookmarks' ? null : 'bookmarks';
    if (activePanel === 'bookmarks') {
      setMode('manual');
    }
  };

  const toggleTimeline = () => {
    activePanel = activePanel === 'timeline' ? null : 'timeline';
    if (activePanel === 'timeline') {
      setMode('auto');
    }
  };

  const toggleShare = () => {
    activePanel = activePanel === 'share' ? null : 'share';
  };

  // The right-side panel is an overlay drawer: dragging its left edge covers
  // the canvas and code editor instead of squeezing them.
  const PANEL_WIDTH_KEY = 'rightPanelWidth';
  const PANEL_MIN_WIDTH = 420;
  const PANEL_MAX_WIDTH = 700;
  let panelWidth = $state(420);
  let panelDragging = false;
  let panelDragStartX = 0;
  let panelDragStartWidth = 0;

  const startPanelDrag = (event: PointerEvent) => {
    panelDragging = true;
    panelDragStartX = event.clientX;
    panelDragStartWidth = panelWidth;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };

  const movePanelDrag = (event: PointerEvent) => {
    if (!panelDragging) {
      return;
    }
    panelWidth = Math.max(
      PANEL_MIN_WIDTH,
      Math.min(panelDragStartWidth + (panelDragStartX - event.clientX), PANEL_MAX_WIDTH, width)
    );
  };

  const endPanelDrag = () => {
    panelDragging = false;
    localStorage.setItem(PANEL_WIDTH_KEY, String(panelWidth));
  };

  let editorPane = $state<Resizable.Pane>();
</script>

<svelte:window onpointerdown={handleWindowPointerDown} />

<div class="flex h-full flex-col overflow-hidden">
  {#snippet mobileToggle()}
    <div
      class="inline-flex h-8 items-center rounded-lg bg-muted p-0.5 text-muted-foreground"
      role="tablist"
      aria-label="View mode">
      <button
        type="button"
        role="tab"
        aria-selected={!isViewMode}
        class={[
          'inline-flex h-7 items-center justify-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-all select-none',
          !isViewMode
            ? 'bg-background font-semibold text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        ]}
        onclick={() => {
          isViewMode = false;
          logEvent('mobileViewToggle', { mode: 'edit' });
        }}>
        <EditIcon class="size-3.5" />
        <span>Edit</span>
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={isViewMode}
        class={[
          'inline-flex h-7 items-center justify-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-all select-none',
          isViewMode
            ? 'bg-background font-semibold text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        ]}
        onclick={() => {
          isViewMode = true;
          logEvent('mobileViewToggle', { mode: 'view' });
        }}>
        <ViewIcon class="size-3.5" />
        <span>View</span>
      </button>
    </div>
  {/snippet}

  {#snippet editorTitle()}
    <Button
      variant={activeEditorTab === 'code' ? 'secondary' : 'ghost'}
      size="sm"
      class={[
        'h-8 gap-1.5 px-2.5 text-xs font-medium',
        activeEditorTab === 'code' && 'bg-accent/15 font-semibold text-accent hover:bg-accent/20'
      ]}
      onclick={(e) => {
        e.stopPropagation();
        activeEditorTab = 'code';
      }}>
      <CodeIcon class="size-4" />
      Code
    </Button>
  {/snippet}

  {#snippet editorActions()}
    <Button
      variant={activeEditorTab === 'samples' ? 'secondary' : 'ghost'}
      size="sm"
      class={[
        'h-8 gap-1.5 px-2.5 text-xs font-medium',
        activeEditorTab === 'samples' && 'bg-accent/15 font-semibold text-accent hover:bg-accent/20'
      ]}
      onclick={() => {
        activeEditorTab = activeEditorTab === 'samples' ? 'code' : 'samples';
      }}>
      <ShapesIcon class="size-4" />
      Samples
    </Button>
  {/snippet}

  <Navbar mobileToggle={isMobile ? mobileToggle : undefined}>
    <div class="relative inline-flex">
      <Button
        variant={activePanel === 'bookmarks' ? 'secondary' : 'default'}
        size="sm"
        class="gap-1.5"
        onclick={toggleBookmarks}
        title="Bookmarks">
        <BookmarkIcon class="size-4" />
        Bookmarks
      </Button>
      {#if historyState.bookmarkCount > 0}
        <span
          class="pointer-events-none absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-foreground shadow-sm">
          {historyState.bookmarkCount}
        </span>
      {/if}
    </div>
    <Button
      variant={activePanel === 'timeline' ? 'secondary' : 'default'}
      size="sm"
      class="gap-1.5"
      onclick={toggleTimeline}
      title="Timeline">
      <HistoryIcon class="size-4" />
      Timeline
    </Button>
    <Button
      variant={activePanel === 'share' ? 'secondary' : 'default'}
      size="sm"
      class="gap-1.5"
      onclick={toggleShare}
      title="Share">
      <ShareIcon class="size-4" />
      Share
    </Button>
  </Navbar>

  <div class="flex flex-1 flex-col overflow-hidden" bind:clientWidth={width}>
    {#if isMobile}
      <div class="relative h-full w-full overflow-hidden">
        <!-- Mobile Editor Pane -->
        <div
          class={[
            'h-full w-full flex-col gap-4 overflow-y-auto p-2',
            isViewMode ? 'hidden' : 'flex'
          ]}>
          <Card isOpen titleSnippet={editorTitle} actions={editorActions} isClosable={false}>
            {#if activeEditorTab === 'code'}
              <div bind:this={editorContainerRef} class="h-full">
                <Editor {isMobile} />
              </div>
            {:else}
              <div class="h-full">
                <SamplesPanel />
              </div>
            {/if}
          </Card>
        </div>

        <!-- Mobile View Pane -->
        <div
          class={[
            'relative h-full w-full flex-col overflow-hidden',
            !isViewMode ? 'hidden' : 'flex'
          ]}>
          {#if initialLoadDone}
            <View {panZoomState} shouldShowGrid={validatedState.current.grid} />
            <div class="absolute top-0 right-0 left-0 mx-auto w-fit">
              <CanvasToolbar
                {panZoomState}
                fullScreenHref={urls.current.view}
                onSave={() => void handleSaveDiagram()}
                onBookmark={handleBookmarkDiagram}>
                {#snippet leading()}
                  <StyleToggles />
                {/snippet}
              </CanvasToolbar>
            </div>
            <div class="absolute right-0 bottom-0"><VersionSecurityToolbar /></div>
          {/if}
        </div>

        <!-- Mobile Share Panel -->
        {#if activePanel === 'share'}
          <div class="absolute inset-0 z-40 flex flex-col overflow-hidden bg-background p-2">
            <Share onClose={() => (activePanel = null)} />
          </div>
        {/if}
      </div>
    {:else}
      <Resizable.PaneGroup
        direction="horizontal"
        autoSaveId="liveEditor"
        class="relative gap-4 p-2 pt-0 sm:gap-0 sm:p-6 sm:pt-0">
        <Resizable.Pane bind:this={editorPane} defaultSize={30} minSize={15}>
          <div class="flex h-full flex-col gap-4 sm:gap-6">
            <Card isOpen titleSnippet={editorTitle} actions={editorActions} isClosable={false}>
              {#if activeEditorTab === 'code'}
                <div bind:this={editorContainerRef} class="h-full">
                  <Editor {isMobile} />
                </div>
              {:else}
                <div class="h-full">
                  <SamplesPanel />
                </div>
              {/if}
            </Card>
          </div>
        </Resizable.Pane>
        <Resizable.Handle class="mr-1 hidden opacity-0 sm:block" />
        <Resizable.Pane minSize={15} class="relative flex h-full flex-1 flex-col overflow-hidden">
          {#if initialLoadDone}
            <View {panZoomState} shouldShowGrid={validatedState.current.grid} />
            <div class="absolute top-0 right-0">
              <CanvasToolbar
                {panZoomState}
                fullScreenHref={urls.current.view}
                onSave={() => void handleSaveDiagram()}
                onBookmark={handleBookmarkDiagram}>
                {#snippet leading()}
                  <StyleToggles />
                {/snippet}
              </CanvasToolbar>
            </div>
            <div class="absolute right-0 bottom-0"><VersionSecurityToolbar /></div>
          {/if}
        </Resizable.Pane>
        {#if activePanel}
          <!-- Overlay drawer: intentionally outside the pane group so resizing
               covers the canvas and code editor instead of squeezing them. -->
          <div
            class="absolute inset-y-0 right-0 z-20 flex flex-col bg-background shadow-2xl"
            style:width="{panelWidth}px">
            <div
              role="separator"
              aria-orientation="vertical"
              class="absolute inset-y-0 -left-1 z-10 w-2 cursor-col-resize touch-none hover:bg-border/60"
              onpointerdown={startPanelDrag}
              onpointermove={movePanelDrag}
              onpointerup={endPanelDrag}
              onpointercancel={endPanelDrag}>
            </div>
            <div class="flex h-full flex-col overflow-hidden">
              {#if activePanel === 'bookmarks'}
                <Bookmarks />
              {:else if activePanel === 'timeline'}
                <Timeline />
              {:else if activePanel === 'share'}
                <Share />
              {/if}
            </div>
          </div>
        {/if}
      </Resizable.PaneGroup>
    {/if}
  </div>
</div>

<EditorChooserModal bind:open={showEditorChooser} />
