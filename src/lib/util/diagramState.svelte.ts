import { api } from '$lib/services/api';
import { inputState, resetInputForPendingLoad, updateCode } from '$lib/util/state.svelte';
import { debounce } from 'lodash-es';
import { SvelteURL, SvelteURLSearchParams } from 'svelte/reactivity';

export const AUTO_SAVE_DEBOUNCE_MS = 10_000;
export const SAVING_DISPLAY_DELAY_MS = 3_000;

export interface SaveOptions {
  silent?: boolean;
}

export class DiagramState {
  id = $state<string | null>(null);
  workspaceId = $state<string | null>(null);
  title = $state<string>('Untitled Diagram');
  saveStatus = $state<'idle' | 'saving' | 'saved' | 'error'>('idle');
  errorMessage = $state<string | null>(null);
  bookmarkStatus = $state<'idle' | 'bookmarked' | 'duplicate' | 'error'>('idle');
  bookmarkErrorMessage = $state<string | null>(null);

  private initialized = false;
  /** In-flight loadFromUrl promise; concurrent calls (onMount + afterNavigate) share it
   *  so a fresh /diagram visit never creates two diagrams. */
  private loadPromise: Promise<void> | null = null;
  lastSavedCode = '';
  lastSavedTitle = '';
  debouncedSave: ReturnType<typeof debounce>;
  private savingTimer?: ReturnType<typeof setTimeout>;
  private bookmarkTimer?: ReturnType<typeof setTimeout>;
  private savedTimer?: ReturnType<typeof setTimeout>;
  private errorTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    this.debouncedSave = debounce(() => void this.save(), AUTO_SAVE_DEBOUNCE_MS);
  }

  get hasChanges(): boolean {
    return inputState.code !== this.lastSavedCode || this.title !== this.lastSavedTitle;
  }

  showBookmarked() {
    if (this.bookmarkTimer) {
      clearTimeout(this.bookmarkTimer);
    }
    this.bookmarkStatus = 'bookmarked';
    this.bookmarkErrorMessage = null;
    this.bookmarkTimer = setTimeout(() => {
      this.bookmarkStatus = 'idle';
      this.bookmarkTimer = undefined;
    }, 3_000);
  }

  showBookmarkDuplicate() {
    if (this.bookmarkTimer) {
      clearTimeout(this.bookmarkTimer);
    }
    this.bookmarkStatus = 'duplicate';
    this.bookmarkErrorMessage = null;
    this.bookmarkTimer = setTimeout(() => {
      this.bookmarkStatus = 'idle';
      this.bookmarkTimer = undefined;
    }, 3_000);
  }

  showBookmarkError(message = 'Failed to save bookmark') {
    if (this.bookmarkTimer) {
      clearTimeout(this.bookmarkTimer);
    }
    this.bookmarkStatus = 'error';
    this.bookmarkErrorMessage = message;
    this.bookmarkTimer = setTimeout(() => {
      if (this.bookmarkStatus === 'error') {
        this.bookmarkStatus = 'idle';
        this.bookmarkErrorMessage = null;
      }
      this.bookmarkTimer = undefined;
    }, 3_000);
  }

  async loadFromUrl() {
    if (this.loadPromise) {
      return this.loadPromise;
    }
    this.loadPromise = this.doLoadFromUrl().finally(() => {
      this.loadPromise = null;
    });
    return this.loadPromise;
  }

  private async doLoadFromUrl() {
    if (typeof window === 'undefined') return;

    const searchParams = new SvelteURLSearchParams(window.location.search);
    const idParam = searchParams.get('id');

    if (!idParam) {
      this.id = null;
      this.title = 'Untitled Diagram';
      this.saveStatus = 'idle';
      this.initialized = true;

      // Resolve the workspace the new diagram belongs to: explicit query param,
      // otherwise the workspace currently selected on the dashboard.
      const workspaceParam = searchParams.get('workspaceId');
      this.workspaceId =
        workspaceParam || localStorage.getItem('diagrams.currentWorkspaceId') || '';

      // 新建项目时静默保存
      await this.save({ silent: true });
      return;
    }

    this.id = idParam;
    this.saveStatus = 'idle';

    // Blank the editor while fetching: the persisted input state still holds
    // the previously opened diagram, and showing (or rendering) it before the
    // fetched content arrives is exactly the stale flash this avoids.
    resetInputForPendingLoad();

    try {
      const diagram = await api.getDiagram(idParam);
      this.title = diagram.title || 'Untitled Diagram';
      this.workspaceId = diagram.workspace_id || '';
      this.lastSavedTitle = this.title;
      this.lastSavedCode = diagram.code;
      updateCode(diagram.code, { updateDiagram: true });
      this.saveStatus = 'idle';
    } catch (err) {
      console.error('Failed to load diagram:', err);
      this.errorMessage = err instanceof Error ? err.message : 'Failed to load diagram';
      this.saveStatus = 'error';
    } finally {
      this.initialized = true;
    }
  }

  async rename(newTitle: string) {
    if (!this.initialized) return;
    const trimmed = newTitle.trim() || 'Untitled Diagram';
    this.title = trimmed;
    if (trimmed !== this.lastSavedTitle) {
      // 重命名时静默保存，不显示 saving/saved 标识
      await this.save({ silent: true });
    }
  }

  async save(options: SaveOptions = {}) {
    if (!this.initialized) return;

    this.debouncedSave.cancel();

    const currentCode = inputState.code;
    if (currentCode === undefined || currentCode === null) return;

    if (this.savingTimer) {
      clearTimeout(this.savingTimer);
      this.savingTimer = undefined;
    }
    if (this.savedTimer) {
      clearTimeout(this.savedTimer);
      this.savedTimer = undefined;
    }
    if (this.errorTimer) {
      clearTimeout(this.errorTimer);
      this.errorTimer = undefined;
    }

    const isSilent = Boolean(options.silent);

    if (isSilent) {
      // 静默保存立即同步已保存标记，避免响应式触发 notifyChange 再次调度非静默自动保存
      this.lastSavedCode = currentCode;
      this.lastSavedTitle = this.title;
    } else {
      this.errorMessage = null;
      // 当保存过程小于3秒时，不显示 saving，直接在成功后显示 saved；超过3秒才显示 saving
      this.savingTimer = setTimeout(() => {
        this.saveStatus = 'saving';
      }, SAVING_DISPLAY_DELAY_MS);
    }

    try {
      const currentTitle = this.title.trim() || 'Untitled Diagram';
      if (this.id) {
        await api.updateDiagram(this.id, {
          title: currentTitle,
          code: currentCode
        });
        this.lastSavedCode = currentCode;
        this.lastSavedTitle = this.title;
      } else {
        const created = await api.createDiagram({
          title: currentTitle,
          code: currentCode,
          workspace_id: this.workspaceId || null
        });
        this.workspaceId = created.workspace_id || this.workspaceId || '';
        this.id = created.id;
        this.lastSavedCode = currentCode;
        this.lastSavedTitle = this.title;

        const newUrl = new SvelteURL(window.location.href);
        newUrl.searchParams.set('id', created.id);
        const currentState = typeof window !== 'undefined' ? (window.history.state ?? {}) : {};
        window.history.replaceState(currentState, '', newUrl.toString());
      }

      if (this.savingTimer) {
        clearTimeout(this.savingTimer);
        this.savingTimer = undefined;
      }

      if (!isSilent) {
        this.saveStatus = 'saved';
        this.savedTimer = setTimeout(() => {
          if (this.saveStatus === 'saved') {
            this.saveStatus = 'idle';
          }
          this.savedTimer = undefined;
        }, 3_000);
      }
    } catch (err) {
      console.error('Failed to save diagram:', err);
      if (this.savingTimer) {
        clearTimeout(this.savingTimer);
        this.savingTimer = undefined;
      }
      if (this.savedTimer) {
        clearTimeout(this.savedTimer);
        this.savedTimer = undefined;
      }
      if (isSilent) {
        this.lastSavedCode = '';
      }
      this.saveStatus = 'error';
      this.errorMessage = err instanceof Error ? err.message : 'Failed to save diagram';
      this.errorTimer = setTimeout(() => {
        if (this.saveStatus === 'error') {
          this.saveStatus = 'idle';
          this.errorMessage = null;
        }
        this.errorTimer = undefined;
      }, 3_000);
    } finally {
      this.debouncedSave.cancel();
    }
  }

  notifyChange() {
    if (!this.initialized) return;

    const currentCode = inputState.code;
    if (currentCode === this.lastSavedCode && this.title === this.lastSavedTitle) {
      return;
    }

    if (this.savedTimer) {
      clearTimeout(this.savedTimer);
      this.savedTimer = undefined;
    }
    if (this.errorTimer) {
      clearTimeout(this.errorTimer);
      this.errorTimer = undefined;
    }

    // When user edits (new unsaved changes), the prompt disappears
    this.saveStatus = 'idle';
    this.debouncedSave();
  }
}

export const diagramState = new DiagramState();
