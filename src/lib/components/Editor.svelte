<script lang="ts">
  import type { Component } from 'svelte';
  import { TID } from '$/constants';
  import { updateCode, validatedState } from '$lib/util/state.svelte';
  import { debounce } from 'lodash-es';
  import ExclamationCircleIcon from '~icons/material-symbols/error-outline-rounded';

  const { isMobile } = $props<{ isMobile: boolean }>();
  const onUpdate = (text: string) => {
    updateCode(text);
  };

  // The code editors (Monaco on desktop, CodeMirror on mobile) are large
  // dependencies; loading them dynamically keeps them off the critical path so
  // the diagram canvas can render first.
  let CodeEditor: Component<{ isMobile: boolean; onUpdate: (text: string) => void }> | undefined =
    $state();
  $effect(() => {
    let cancelled = false;
    void (
      isMobile
        ? import('$/components/MobileEditor.svelte')
        : import('$/components/DesktopEditor.svelte')
    ).then((module) => {
      if (!cancelled) {
        CodeEditor = module.default;
      }
    });
    return () => {
      cancelled = true;
    };
  });

  let showError = $state(false);

  const showErrorDebounced = debounce(() => {
    showError = true;
  }, 3000);

  $effect(() => {
    if (validatedState.current.error) {
      showErrorDebounced();
    } else {
      showErrorDebounced.cancel();
      showError = false;
    }

    return () => {
      showErrorDebounced.cancel();
    };
  });
</script>

<div class="flex h-full flex-col">
  {#if CodeEditor}
    <CodeEditor {isMobile} {onUpdate} />
  {:else}
    <div
      class="flex h-full items-center justify-center text-sm text-muted-foreground"
      role="status"
      aria-label="Loading editor">
      Loading editor…
    </div>
  {/if}
  {#if showError && validatedState.current.error instanceof Error}
    <div class="flex flex-col text-sm" data-testid={TID.errorContainer}>
      <div class="flex items-center justify-between gap-2 bg-slate-900 p-2 text-white">
        <div class="flex w-fit items-center gap-2">
          <ExclamationCircleIcon class="size-6 text-destructive" aria-hidden="true" />
          <div class="flex flex-col">
            <p>Syntax error</p>
          </div>
        </div>
      </div>
      <output class="max-h-32 overflow-auto bg-muted p-2" name="mermaid-error" for="editor">
        <pre>{validatedState.current.error?.toString()}</pre>
      </output>
    </div>
  {/if}
</div>
