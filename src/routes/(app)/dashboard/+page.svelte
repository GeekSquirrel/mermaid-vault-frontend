<script lang="ts">
  import Navbar from '$/components/Navbar.svelte';
  import DiagramCard from '$/components/DiagramCard.svelte';
  import { Button } from '$/components/ui/button';
  import * as Dialog from '$/components/ui/dialog';
  import { Switch } from '$/components/ui/switch';
  import { api, type Diagram, type Workspace } from '$lib/services/api';
  import { mode } from 'mode-watcher';
  import { setModeWithFade } from '$/util/themeTransition';
  import { toast } from 'svelte-sonner';
  import { fade, slide } from 'svelte/transition';
  import { flip } from 'svelte/animate';
  import { SvelteMap } from 'svelte/reactivity';
  import { onMount, tick } from 'svelte';
  import AddIcon from '~icons/material-symbols/add-2-rounded';
  import CheckBoxBlankIcon from '~icons/material-symbols/check-box-outline-blank-rounded';
  import CheckBoxIcon from '~icons/material-symbols/check-box-outline-rounded';
  import CheckIcon from '~icons/material-symbols/check-rounded';
  import CloseIcon from '~icons/material-symbols/close-rounded';
  import ChecklistIcon from '~icons/material-symbols/checklist-rounded';
  import ContrastIcon from '~icons/material-symbols/contrast';
  import DeleteIcon from '~icons/material-symbols/delete-outline-rounded';
  import PencilIcon from '~icons/material-symbols/edit-outline-rounded';
  import PanelCloseIcon from '~icons/material-symbols/left-panel-close-outline-rounded';
  import PanelOpenIcon from '~icons/material-symbols/left-panel-open-outline-rounded';
  import RefreshIcon from '~icons/material-symbols/refresh-rounded';
  import SearchIcon from '~icons/material-symbols/search-rounded';
  import CopyIcon from '~icons/material-symbols/content-copy-outline-rounded';
  import SmartToyIcon from '~icons/material-symbols/smart-toy-outline-rounded';
  import { session } from '$/util/session.svelte';

  const SIDEBAR_KEY = 'diagrams.sidebarOpen';
  const WORKSPACE_KEY = 'diagrams.currentWorkspaceId';
  const SIDEBAR_WIDTH_KEY = 'diagrams.sidebarWidth';
  const MCP_ENABLED_KEY = 'diagrams.mcpEnabled';
  const MCP_TOKEN_KEY = 'diagrams.mcpToken';
  const SIDEBAR_MIN_WIDTH = 220;
  const SIDEBAR_MAX_WIDTH = 440;

  let mcpEnabled = $state(false);
  let mcpCopied = $state(false);

  let diagrams = $state<Diagram[]>([]);
  let workspaces = $state<Workspace[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let searchQuery = $state('');
  let currentWorkspaceId = $state('');
  let sidebarOpen = $state(true);
  let sidebarWidth = $state(240);
  let resizingSidebar = $state(false);
  let resizeStartX = 0;
  let resizeStartWidth = 0;
  let selectMode = $state(false);
  let selectedIds = $state<string[]>([]);
  let searchInputEl = $state<HTMLInputElement | null>(null);

  // Inline workspace creation: the long plus button swaps places with an input
  let creatingWorkspace = $state(false);
  let newWorkspaceName = $state('');
  let createInputEl = $state<HTMLInputElement | null>(null);

  // Inline workspace rename: the list item swaps its name for an input
  let renamingId = $state<string | null>(null);
  let renameValue = $state('');
  let renameInputEl = $state<HTMLInputElement | null>(null);

  // Inline delete confirmation: the sidebar row itself shows the overlay
  let pendingDeleteWorkspaceId = $state<string | null>(null);

  // Styled confirmation dialog (multi-select batch delete)
  let confirmOpen = $state(false);
  let confirmTitle = $state('');
  let confirmDescription = $state('');
  let confirmAction: (() => Promise<void>) | null = null;

  const requestConfirm = (title: string, description: string, action: () => Promise<void>) => {
    confirmTitle = title;
    confirmDescription = description;
    confirmAction = action;
    confirmOpen = true;
  };

  const runConfirmedAction = async () => {
    confirmOpen = false;
    const action = confirmAction;
    confirmAction = null;
    if (action) {
      await action();
    }
  };

  const loadDiagrams = async () => {
    loading = true;
    error = null;
    try {
      diagrams = await api.getDiagrams();
      selectedIds = [];
      selectMode = false;
    } catch (err) {
      console.error('Failed to load diagrams:', err);
      error = err instanceof Error ? err.message : 'Unable to connect to backend server';
    } finally {
      loading = false;
    }
  };

  const loadWorkspaces = async () => {
    try {
      // Backend returns the manually ordered list (drag & drop persisted)
      const list = await api.getWorkspaces();
      workspaces = list;
      if (!list.some((w) => w.id === currentWorkspaceId)) {
        currentWorkspaceId = list[0]?.id ?? '';
      }
      return list;
    } catch (err) {
      console.error('Failed to load workspaces:', err);
      return [];
    }
  };

  onMount(() => {
    const storedSidebar = localStorage.getItem(SIDEBAR_KEY);
    if (storedSidebar !== null) {
      sidebarOpen = storedSidebar === 'true';
    }
    const storedWidth = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY));
    if (storedWidth >= SIDEBAR_MIN_WIDTH && storedWidth <= SIDEBAR_MAX_WIDTH) {
      sidebarWidth = storedWidth;
    }
    const storedWorkspace = localStorage.getItem(WORKSPACE_KEY);
    if (storedWorkspace) {
      currentWorkspaceId = storedWorkspace;
    }
    const storedMcp = localStorage.getItem(MCP_ENABLED_KEY);
    if (storedMcp !== null) {
      mcpEnabled = storedMcp === 'true';
    }
    void loadDiagrams();
    void loadWorkspaces().then((list) => {
      // Deep link from the editor breadcrumb: /dashboard?workspace=<id>
      const wsParam = new URLSearchParams(window.location.search).get('workspace');
      if (wsParam && list.some((w) => w.id === wsParam)) {
        switchWorkspace(wsParam);
      }
    });
  });

  const toggleMcp = async (enabled: boolean) => {
    mcpEnabled = enabled;
    localStorage.setItem(MCP_ENABLED_KEY, String(enabled));

    if (enabled && session.authEnabled) {
      const existingToken = localStorage.getItem(MCP_TOKEN_KEY);
      if (!existingToken) {
        try {
          const res = await api.auth.createToken({ name: 'MCP Client' });
          if (res.token) {
            localStorage.setItem(MCP_TOKEN_KEY, res.token);
          }
        } catch (err) {
          console.error('Failed to pre-generate MCP token', err);
        }
      }
    }
  };

  const copyMcpConfig = async () => {
    let token = localStorage.getItem(MCP_TOKEN_KEY);
    if (session.authEnabled && !token) {
      try {
        const res = await api.auth.createToken({ name: 'MCP Client' });
        if (res.token) {
          token = res.token;
          localStorage.setItem(MCP_TOKEN_KEY, token);
        }
      } catch {
        toast.error('Failed to generate API token for MCP');
        return;
      }
    }

    const config = {
      mcpServers: {
        'mermaid-vault': {
          url: `${window.location.origin}/api/mcp`,
          ...(session.authEnabled && token
            ? {
                headers: {
                  Authorization: `Bearer ${token}`
                }
              }
            : {})
        }
      }
    };

    try {
      await navigator.clipboard.writeText(JSON.stringify(config, null, 2));
      mcpCopied = true;
      toast.success('MCP configuration copied to clipboard');
      setTimeout(() => {
        mcpCopied = false;
      }, 2000);
    } catch {
      toast.error('Failed to copy configuration to clipboard');
    }
  };

  const toggleSidebar = () => {
    sidebarOpen = !sidebarOpen;
    localStorage.setItem(SIDEBAR_KEY, String(sidebarOpen));
  };

  const startResize = (e: PointerEvent) => {
    resizingSidebar = true;
    resizeStartX = e.clientX;
    resizeStartWidth = sidebarWidth;
    e.preventDefault();
  };

  const handlePointerMove = (e: PointerEvent) => {
    if (!resizingSidebar) {
      return;
    }
    sidebarWidth = Math.min(
      SIDEBAR_MAX_WIDTH,
      Math.max(SIDEBAR_MIN_WIDTH, resizeStartWidth + (e.clientX - resizeStartX))
    );
  };

  const endResize = () => {
    if (!resizingSidebar) {
      return;
    }
    resizingSidebar = false;
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth));
  };

  const handleResizeKeydown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const step = e.key === 'ArrowLeft' ? -16 : 16;
      sidebarWidth = Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, sidebarWidth + step));
      localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth));
    }
  };

  // Matches the aside's md: breakpoint where the sidebar stops being an overlay
  const isMobileViewport = () => !window.matchMedia('(min-width: 768px)').matches;

  const switchWorkspace = (id: string) => {
    currentWorkspaceId = id;
    localStorage.setItem(WORKSPACE_KEY, id);
    selectMode = false;
    selectedIds = [];
    // On mobile the sidebar covers the whole page, so a selection dismisses it;
    // on desktop it stays open as a persistent column
    if (isMobileViewport() && sidebarOpen) {
      sidebarOpen = false;
      localStorage.setItem(SIDEBAR_KEY, 'false');
    }
  };

  const startCreateWorkspace = () => {
    creatingWorkspace = true;
    newWorkspaceName = '';
    void tick().then(() => {
      createInputEl?.focus();
    });
  };

  const confirmCreateWorkspace = async () => {
    if (!creatingWorkspace) {
      return;
    }
    const name = newWorkspaceName.trim();
    creatingWorkspace = false;
    newWorkspaceName = '';
    if (!name) {
      return;
    }
    try {
      const workspace = await api.createWorkspace({ name });
      // The new workspace takes the first slot; existing entries shift down
      workspaces = [workspace, ...workspaces];
      switchWorkspace(workspace.id);
    } catch (err) {
      toast.error(
        `Failed to create workspace: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
    }
  };

  const cancelCreateWorkspace = () => {
    creatingWorkspace = false;
    newWorkspaceName = '';
  };

  // Manual workspace ordering via drag & drop
  let draggingWorkspaceId = $state<string | null>(null);
  let dropTargetId = $state<string | null>(null);
  let dropAbove = $state(false);

  const clearDragState = () => {
    draggingWorkspaceId = null;
    dropTargetId = null;
    dropAbove = false;
  };

  const handleDragStart = (e: DragEvent, workspace: Workspace) => {
    if (renamingId !== null || pendingDeleteWorkspaceId !== null) {
      e.preventDefault();
      return;
    }
    draggingWorkspaceId = workspace.id;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', workspace.id);
    }
  };

  const handleDragOver = (e: DragEvent, workspace: Workspace) => {
    if (!draggingWorkspaceId || draggingWorkspaceId === workspace.id) {
      return;
    }
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move';
    }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    dropTargetId = workspace.id;
    dropAbove = e.clientY < rect.top + rect.height / 2;
  };

  const handleDrop = (e: DragEvent, workspace: Workspace) => {
    e.preventDefault();
    const from = workspaces.findIndex((w) => w.id === draggingWorkspaceId);
    if (from === -1 || draggingWorkspaceId === workspace.id) {
      clearDragState();
      return;
    }
    const list = [...workspaces];
    const [moved] = list.splice(from, 1);
    let to = list.findIndex((w) => w.id === workspace.id);
    if (!dropAbove) {
      to += 1;
    }
    list.splice(to, 0, moved);
    workspaces = list;
    clearDragState();
    api
      .updateWorkspaceOrder(list.map((w) => w.id))
      .catch((err) =>
        toast.error(
          `Failed to save workspace order: ${err instanceof Error ? err.message : 'Unknown error'}`
        )
      );
  };

  const handleCreateKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void confirmCreateWorkspace();
    } else if (e.key === 'Escape') {
      cancelCreateWorkspace();
    }
  };

  const startRenameWorkspace = (workspace: Workspace) => {
    renamingId = workspace.id;
    renameValue = workspace.name;
    void tick().then(() => {
      renameInputEl?.focus();
      renameInputEl?.select();
    });
  };

  const commitRenameWorkspace = async () => {
    const id = renamingId;
    if (!id) {
      return;
    }
    renamingId = null;
    const workspace = workspaces.find((w) => w.id === id);
    const name = renameValue.trim();
    renameValue = '';
    if (!workspace || !name || name === workspace.name) {
      return;
    }
    try {
      const updated = await api.updateWorkspace(id, { name });
      workspaces = workspaces.map((w) => (w.id === id ? updated : w));
    } catch (err) {
      toast.error(
        `Failed to rename workspace: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
    }
  };

  const cancelRenameWorkspace = () => {
    renamingId = null;
    renameValue = '';
  };

  const handleRenameKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void commitRenameWorkspace();
    } else if (e.key === 'Escape') {
      cancelRenameWorkspace();
    }
  };

  const requestDeleteWorkspace = (workspace: Workspace) => {
    pendingDeleteWorkspaceId = workspace.id;
  };

  const cancelDeleteWorkspace = () => {
    pendingDeleteWorkspaceId = null;
  };

  const confirmDeleteWorkspace = async () => {
    const id = pendingDeleteWorkspaceId;
    if (!id) {
      return;
    }
    pendingDeleteWorkspaceId = null;
    try {
      await api.deleteWorkspace(id);
      const list = await loadWorkspaces();
      if (currentWorkspaceId === id) {
        switchWorkspace(list[0]?.id ?? '');
      }
    } catch (err) {
      toast.error(
        `Failed to delete workspace: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
    }
  };

  const handleRenameDiagram = async (diagram: Diagram, title: string) => {
    try {
      const updated = await api.updateDiagram(diagram.id, { title });
      diagrams = diagrams.map((p) => (p.id === diagram.id ? updated : p));
    } catch (err) {
      toast.error(`Failed to rename: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleDuplicateDiagram = async (diagram: Diagram): Promise<Diagram | undefined> => {
    try {
      const copy = await api.createDiagram({
        title: `${diagram.title || 'Untitled Diagram'} (copy)`,
        code: diagram.code,
        workspace_id: diagram.workspace_id ?? currentWorkspaceId
      });
      diagrams = [...diagrams, copy];
      toast.success(`Duplicated "${diagram.title || 'Untitled Diagram'}"`);
      return copy;
    } catch (err) {
      toast.error(`Failed to duplicate: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleMoveDiagram = async (diagram: Diagram, workspaceId: string) => {
    if (diagram.workspace_id === workspaceId) {
      return;
    }
    try {
      const updated = await api.updateDiagram(diagram.id, { workspace_id: workspaceId });
      diagrams = diagrams.map((p) => (p.id === diagram.id ? updated : p));
      const target = workspaces.find((w) => w.id === workspaceId);
      toast.success(`Moved to "${target?.name ?? 'workspace'}"`);
    } catch (err) {
      toast.error(`Failed to move: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleDeleteDiagram = async (diagram: Diagram) => {
    try {
      await api.deleteDiagram(diagram.id);
      diagrams = diagrams.filter((p) => p.id !== diagram.id);
      selectedIds = selectedIds.filter((selected) => selected !== diagram.id);
    } catch (err) {
      toast.error(`Failed to delete: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const toggleSelectMode = () => {
    selectMode = !selectMode;
    selectedIds = [];
  };

  const toggleDiagramSelection = (id: string) => {
    selectedIds = selectedIds.includes(id)
      ? selectedIds.filter((selected) => selected !== id)
      : [...selectedIds, id];
  };

  const handleBatchDelete = () => {
    const idsToDelete = [...selectedIds];
    if (idsToDelete.length === 0) {
      return;
    }
    requestConfirm(
      'Delete diagrams',
      `Are you sure you want to delete ${idsToDelete.length} selected diagram(s)? This action cannot be undone.`,
      async () => {
        const deletedIds: string[] = [];
        let failed = 0;
        for (const id of idsToDelete) {
          try {
            await api.deleteDiagram(id);
            deletedIds.push(id);
          } catch {
            failed++;
          }
        }
        diagrams = diagrams.filter((p) => !deletedIds.includes(p.id));
        selectedIds = selectedIds.filter((id) => !deletedIds.includes(id));
        if (failed > 0) {
          toast.error(
            `Failed to delete ${failed} of ${idsToDelete.length} diagram(s). Please try again.`
          );
        } else {
          toast.success(`Deleted ${deletedIds.length} diagram(s)`);
        }
      }
    );
  };

  const handleKeydown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    const isTyping =
      target &&
      (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
    if (e.key === 'Escape' && selectMode) {
      selectMode = false;
      selectedIds = [];
    } else if (e.key === '/' && !isTyping) {
      e.preventDefault();
      searchInputEl?.focus();
    }
  };

  // The backend guarantees every diagram belongs to an existing workspace
  const workspaceDiagrams = $derived(diagrams.filter((p) => p.workspace_id === currentWorkspaceId));

  const filteredDiagrams = $derived(
    workspaceDiagrams.filter(
      (p) =>
        p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.code.toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

  const diagramCounts = $derived.by(() => {
    const counts = new SvelteMap<string, number>();
    for (const p of diagrams) {
      const id = p.workspace_id || '';
      counts.set(id, (counts.get(id) || 0) + 1);
    }
    return counts;
  });

  const currentWorkspaceName = $derived(
    workspaces.find((w) => w.id === currentWorkspaceId)?.name ?? ''
  );

  const allSelected = $derived(
    filteredDiagrams.length > 0 && filteredDiagrams.every((p) => selectedIds.includes(p.id))
  );

  const toggleSelectAll = () => {
    selectedIds = allSelected ? [] : filteredDiagrams.map((p) => p.id);
  };
</script>

{#snippet sidebarToggle()}
  <Button
    variant="ghost"
    size="sm"
    class="h-9 w-9 shrink-0 p-0"
    onclick={toggleSidebar}
    title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
    aria-label="Toggle sidebar">
    {#if sidebarOpen}
      <PanelCloseIcon class="size-5" />
    {:else}
      <PanelOpenIcon class="size-5" />
    {/if}
  </Button>
{/snippet}

{#snippet searchBox()}
  <div class="relative w-full max-w-lg">
    <SearchIcon
      class="pointer-events-none absolute inset-y-0 left-3 my-auto size-4 text-muted-foreground" />
    <input
      type="text"
      placeholder="Search diagrams..."
      bind:this={searchInputEl}
      bind:value={searchQuery}
      class="h-9 w-full rounded-lg border border-border bg-card pr-3 pl-9 text-sm text-foreground shadow-xs transition-all placeholder:text-muted-foreground hover:border-primary/50 focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none" />
  </div>
{/snippet}

<svelte:window
  onkeydown={handleKeydown}
  onpointermove={handlePointerMove}
  onpointerup={endResize}
  onpointercancel={endResize} />

<div
  class="flex h-full flex-col overflow-hidden bg-background text-foreground {resizingSidebar
    ? 'select-none'
    : ''}">
  <Navbar leading={sidebarToggle} center={searchBox} />

  <div class="relative flex min-h-0 flex-1 overflow-hidden">
    <!-- Always mounted so the expand/collapse transition (slide on mobile,
         width push on desktop) can animate; inert when hidden -->
    <aside
      style={`--sidebar-w: ${sidebarWidth}px`}
      inert={!sidebarOpen}
      class={[
        'absolute inset-y-0 left-0 z-40 flex w-full shrink-0 flex-col overflow-hidden border-r border-border bg-card shadow-lg md:relative md:z-auto md:shadow-none',
        'transition-[width,translate] duration-200 ease-in-out',
        resizingSidebar ? 'md:transition-none' : '',
        sidebarOpen
          ? 'translate-x-0 md:w-[var(--sidebar-w)]'
          : '-translate-x-full md:w-0 md:border-r-0'
      ]}>
      <div class="flex w-full min-w-0 flex-1 flex-col md:w-[var(--sidebar-w)] md:shrink-0">
        <div class="px-3 pt-3 pb-1">
          <h2 class="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
            Workspaces
          </h2>
        </div>

        <div class="relative h-9 px-2 pb-2">
          {#if creatingWorkspace}
            <input
              bind:this={createInputEl}
              bind:value={newWorkspaceName}
              type="text"
              placeholder="Workspace name"
              aria-label="New workspace name"
              class="absolute inset-0 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground shadow-xs transition-colors focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30 focus-visible:outline-none"
              transition:fade={{ duration: 130 }}
              onkeydown={handleCreateKeydown}
              onblur={() => void confirmCreateWorkspace()} />
          {:else}
            <button
              type="button"
              class="absolute inset-0 flex w-full items-center justify-center rounded-md border border-dashed border-border text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
              transition:fade={{ duration: 130 }}
              onclick={startCreateWorkspace}
              title="New workspace"
              aria-label="New workspace">
              <AddIcon class="size-4" />
            </button>
          {/if}
        </div>

        <nav class="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-2">
          {#if workspaces.length === 0}
            <button
              type="button"
              transition:fade={{ duration: 150 }}
              class="flex w-full flex-col items-center gap-1 rounded-md border border-dashed border-border px-3 py-4 text-center text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
              onclick={startCreateWorkspace}>
              <span class="text-sm font-medium">No workspaces yet</span>
              <span class="text-xs">Click here to create one</span>
            </button>
          {/if}
          {#each workspaces as workspace (workspace.id)}
            <div
              role="listitem"
              aria-label={`Workspace ${workspace.name}`}
              animate:flip={{ duration: 200 }}
              in:slide={{ duration: 150 }}
              out:fade={{ duration: 120 }}
              draggable={renamingId === null && pendingDeleteWorkspaceId === null}
              class={[
                'group relative flex w-full cursor-grab items-center rounded-md transition-colors active:cursor-grabbing',
                workspace.id === currentWorkspaceId ? 'bg-accent/15' : 'hover:bg-muted',
                draggingWorkspaceId === workspace.id && 'opacity-50',
                dropTargetId === workspace.id &&
                  (dropAbove
                    ? 'shadow-[inset_0_2px_0_0_var(--color-accent)]'
                    : 'shadow-[inset_0_-2px_0_0_var(--color-accent)]')
              ]}
              ondragstart={(e) => handleDragStart(e, workspace)}
              ondragover={(e) => handleDragOver(e, workspace)}
              ondrop={(e) => handleDrop(e, workspace)}
              ondragend={clearDragState}>
              {#if renamingId === workspace.id}
                <input
                  bind:this={renameInputEl}
                  bind:value={renameValue}
                  type="text"
                  aria-label="Workspace name"
                  class="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground shadow-xs transition-colors focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30 focus-visible:outline-none"
                  onkeydown={handleRenameKeydown}
                  onblur={() => void commitRenameWorkspace()} />
              {:else}
                <button
                  type="button"
                  class={[
                    'flex min-w-0 flex-1 items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors',
                    workspace.id === currentWorkspaceId
                      ? 'font-semibold text-accent'
                      : 'text-muted-foreground hover:text-foreground'
                  ]}
                  onclick={() => switchWorkspace(workspace.id)}>
                  <span class="truncate" title={workspace.name}>{workspace.name}</span>
                  <span
                    class="shrink-0 rounded-full bg-muted px-1.5 text-xs text-muted-foreground group-hover:invisible">
                    {diagramCounts.get(workspace.id) || 0}
                  </span>
                </button>
                <div class="hidden shrink-0 items-center gap-0.5 pr-1.5 group-hover:flex">
                  <button
                    type="button"
                    class="flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-background/60 hover:text-foreground"
                    onclick={() => startRenameWorkspace(workspace)}
                    title="Rename workspace"
                    aria-label="Rename workspace">
                    <PencilIcon class="size-3.5" />
                  </button>
                  <button
                    type="button"
                    class="flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-background/60 hover:text-destructive"
                    onclick={() => requestDeleteWorkspace(workspace)}
                    title="Delete workspace"
                    aria-label="Delete workspace">
                    <DeleteIcon class="size-3.5" />
                  </button>
                </div>
              {/if}

              {#if pendingDeleteWorkspaceId === workspace.id}
                <div
                  transition:fade={{ duration: 120 }}
                  class="absolute inset-0 z-10 flex items-center justify-between gap-1 rounded-md bg-background/95 pr-1 pl-2 shadow-sm">
                  <span class="truncate text-xs font-medium text-destructive">
                    Delete "{workspace.name}"?
                  </span>
                  <span class="flex shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      class="flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
                      onclick={() => void confirmDeleteWorkspace()}
                      title="Confirm delete"
                      aria-label="Confirm delete">
                      <CheckIcon class="size-4" />
                    </button>
                    <button
                      type="button"
                      class="flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      onclick={cancelDeleteWorkspace}
                      title="Cancel"
                      aria-label="Cancel delete">
                      <CloseIcon class="size-4" />
                    </button>
                  </span>
                </div>
              {/if}
            </div>
          {/each}
        </nav>

        <div class="flex items-center justify-between border-t border-border px-3 py-3">
          <span class="flex items-center gap-2 text-sm">
            <SmartToyIcon class="size-5" />
            <span>MCP</span>
            {#if mcpEnabled}
              <button
                type="button"
                class="flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                onclick={copyMcpConfig}
                title="Copy MCP configuration"
                aria-label="Copy MCP configuration">
                {#if mcpCopied}
                  <CheckIcon class="size-4 text-accent" />
                {:else}
                  <CopyIcon class="size-4" />
                {/if}
              </button>
            {/if}
          </span>
          <Switch checked={mcpEnabled} onCheckedChange={toggleMcp} />
        </div>

        <div class="flex items-center justify-between border-t border-border px-3 py-3">
          <span class="flex items-center gap-2 text-sm">
            <ContrastIcon class="size-5" />
            Dark Mode
          </span>
          <Switch
            checked={mode.current === 'dark'}
            onCheckedChange={(dark) => setModeWithFade(dark ? 'dark' : 'light')} />
        </div>
      </div>

      <!-- svelte-ignore a11y_no_noninteractive_element_interactions, a11y_no_noninteractive_tabindex -->
      <!-- ARIA separator resize-handle pattern (pointer + arrow keys) -->
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        tabindex="0"
        class="absolute inset-y-0 right-0 z-20 hidden w-1 cursor-col-resize transition-colors hover:bg-accent/30 md:block {resizingSidebar
          ? 'bg-accent/40'
          : ''}"
        onpointerdown={startResize}
        onkeydown={handleResizeKeydown}>
      </div>
    </aside>

    <main class="flex min-w-0 flex-1 flex-col overflow-hidden">
      <div class="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div class="flex min-w-0 items-center gap-2 sm:gap-3">
          <h1 class="truncate text-lg font-semibold">{currentWorkspaceName}</h1>
          <div class="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <Button
              variant="outline"
              size="sm"
              class="h-9 w-9 p-0"
              onclick={() => {
                void loadDiagrams();
                void loadWorkspaces();
              }}
              title="Refresh list">
              <RefreshIcon class="size-4" />
            </Button>

            <Button
              variant={selectMode ? 'secondary' : 'outline'}
              size="sm"
              class="h-9 w-9 p-0 {selectMode ? 'ring-1 ring-ring' : ''}"
              onclick={toggleSelectMode}
              title={selectMode ? 'Exit multi-select' : 'Multi-select'}>
              <ChecklistIcon class="size-4" />
            </Button>

            {#if selectMode}
              <Button
                variant={allSelected ? 'secondary' : 'outline'}
                size="sm"
                class="h-9 w-9 p-0"
                onclick={toggleSelectAll}
                disabled={filteredDiagrams.length === 0}
                title={allSelected ? 'Deselect all' : 'Select all'}>
                {#if allSelected}
                  <CheckBoxIcon class="size-4" />
                {:else}
                  <CheckBoxBlankIcon class="size-4" />
                {/if}
              </Button>
              {#if selectedIds.length > 0}
                <Button
                  variant="destructive"
                  size="sm"
                  class="h-9 gap-1 px-3"
                  onclick={handleBatchDelete}>
                  <DeleteIcon class="size-4" />
                  Delete ({selectedIds.length})
                </Button>
              {/if}
            {/if}
          </div>
        </div>

        <div class="flex shrink-0 items-center gap-2">
          {#if !selectMode && workspaces.length > 0}
            <Button
              variant="accent"
              size="sm"
              class="h-9 gap-1 whitespace-nowrap"
              href={`/diagram?workspaceId=${currentWorkspaceId}`}>
              <AddIcon class="size-4" />
              New Diagram
            </Button>
          {/if}
        </div>
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto px-4 pb-6 sm:px-6">
        {#if loading}
          <div class="flex h-64 items-center justify-center">
            <div class="flex flex-col items-center gap-2 text-muted-foreground">
              <div
                class="size-8 animate-spin rounded-full border-4 border-primary border-t-transparent">
              </div>
              <span class="text-sm">Loading diagrams...</span>
            </div>
          </div>
        {:else if error}
          <div class="rounded-lg border border-destructive/50 bg-destructive/10 p-6 text-center">
            <p class="text-sm font-medium text-destructive">{error}</p>
            <p class="mt-1 text-xs text-muted-foreground">
              Please make sure the backend server is running and reachable
            </p>
            <Button variant="outline" size="sm" class="mt-4" onclick={() => void loadDiagrams()}>
              Retry
            </Button>
          </div>
        {:else if workspaces.length === 0}
          <div
            class="flex h-64 flex-col items-center justify-center rounded-lg border border-dashed border-border p-8 text-center">
            <p class="text-base font-medium">No workspaces yet.</p>
            <p class="mt-1 text-sm text-muted-foreground">
              Create a workspace to start organizing your diagrams.
            </p>
            <Button variant="accent" size="sm" class="mt-4 gap-1" onclick={startCreateWorkspace}>
              <AddIcon class="size-4" />
              New Workspace
            </Button>
          </div>
        {:else if filteredDiagrams.length === 0}
          <div
            class="flex h-64 flex-col items-center justify-center rounded-lg border border-dashed border-border p-8 text-center">
            {#if searchQuery}
              <p class="text-muted-foreground">No diagrams found matching "{searchQuery}"</p>
              <Button variant="ghost" size="sm" class="mt-2" onclick={() => (searchQuery = '')}>
                Clear search
              </Button>
            {:else}
              <p class="text-base font-medium">No diagrams in this workspace yet.</p>
              <p class="mt-1 text-sm text-muted-foreground">
                Created diagrams will be automatically synchronized to SQLite database
              </p>
              <Button
                variant="accent"
                size="sm"
                href={`/diagram?workspaceId=${currentWorkspaceId}`}
                class="mt-4 gap-1">
                <AddIcon class="size-4" />
                Create First Diagram
              </Button>
            {/if}
          </div>
        {:else}
          <div class="diagrams-grid">
            {#each filteredDiagrams as diagram (diagram.id)}
              {@const selected = selectedIds.includes(diagram.id)}
              <DiagramCard
                {diagram}
                {workspaces}
                {selectMode}
                {selected}
                onrename={handleRenameDiagram}
                onduplicate={handleDuplicateDiagram}
                onmove={handleMoveDiagram}
                ondelete={handleDeleteDiagram}
                ontoggleselect={toggleDiagramSelection} />
            {/each}
          </div>
        {/if}
      </div>
    </main>
  </div>
</div>

<Dialog.Root bind:open={confirmOpen}>
  <Dialog.Content class="max-w-md">
    <Dialog.Header>
      <Dialog.Title>{confirmTitle}</Dialog.Title>
      <Dialog.Description>{confirmDescription}</Dialog.Description>
    </Dialog.Header>
    <Dialog.Footer>
      <Button variant="outline" onclick={() => (confirmOpen = false)}>Cancel</Button>
      <Button variant="destructive" onclick={() => void runConfirmedAction()}>Delete</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<style>
  /* Card width never drops below 24rem; columns reduce automatically down to one */
  .diagrams-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(24rem, 100%), 1fr));
    gap: 1rem;
  }

  @media (min-width: 640px) {
    .diagrams-grid {
      gap: 1.5rem;
    }
  }
</style>
