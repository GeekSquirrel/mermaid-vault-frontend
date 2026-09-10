<script lang="ts">
  import { buttonVariants } from '$/components/ui/button';
  import { Input } from '$/components/ui/input';
  import { Separator } from '$/components/ui/separator';
  import { Switch } from '$/components/ui/switch';
  import * as ToggleGroup from '$/components/ui/toggle-group';
  import Card from '$/components/Card/Card.svelte';
  import CopyButton from '$/components/CopyButton.svelte';
  import CopyInput from '$/components/CopyInput.svelte';
  import { MERMAID_LOOKS, MERMAID_THEMES, TID } from '$/constants';
  import { isDarkTheme, type EmbedMode } from '$/util/embed';
  import { EMBED_IFRAME_SANDBOX, buildEmbedSnippets, buildEmbedUrls } from '$/util/embedCode';
  import {
    imageSize,
    isClipboardAvailable,
    onCopyClipboard,
    onDownloadPNG,
    onDownloadSVG
  } from '$/util/exportImage.svelte';
  import { silentlySanitizeConfig } from '$/util/sanitize';
  import { urls, validatedState } from '$/util/state.svelte';
  import { diagramState } from '$/util/diagramState.svelte';
  import { copyToClipboard } from '$/util/util';
  import { base, resolve } from '$app/paths';
  import { logEvent } from '$lib/util/stats';
  import CloseIcon from '~icons/material-symbols/close';
  import DownloadIcon from '~icons/material-symbols/download';
  import EditorLinkIcon from '~icons/material-symbols/edit-outline-rounded';
  import ExternalLinkIcon from '~icons/material-symbols/open-in-new-rounded';
  import GithubIcon from '~icons/mdi/github';
  import GistIcon from '~icons/material-symbols/cloud-download-outline-rounded';
  import IframeIcon from '~icons/material-symbols/code';
  import MarkdownIcon from '~icons/material-symbols/markdown-outline-rounded';
  import PngIcon from '~icons/material-symbols/photo-outline-rounded';
  import SettingsIcon from '~icons/material-symbols/settings-outline-rounded';
  import ShareIcon from '~icons/material-symbols/share';
  import SvgIcon from '~icons/hugeicons/svg-02';
  import ViewLinkIcon from '~icons/material-symbols/visibility-outline-rounded';
  import WebComponentIcon from '~icons/material-symbols/deployed-code-outline-rounded';
  import WidthIcon from '~icons/material-symbols/width-rounded';
  import { Button } from './ui/button';

  interface Props {
    /** Provided on mobile, where the panel needs an explicit close affordance. */
    onClose?: () => void;
  }

  let { onClose }: Props = $props();

  // ---------------------------------------------------------------------------
  // Links
  // ---------------------------------------------------------------------------

  // Persistent editor link: the diagram saved on this server is identified by
  // its id alone, so the link keeps working as the diagram evolves.
  const editorUrl = $derived.by(() => {
    const url = new URL(`${window.location.origin}${resolve('/diagram', {})}`);
    if (diagramState.id) {
      url.searchParams.set('id', diagramState.id);
    }
    return url.toString();
  });

  // ---------------------------------------------------------------------------
  // Import
  // ---------------------------------------------------------------------------

  let gistURL = $state('');
  $effect(() => {
    const { loader } = validatedState.current;
    if (loader?.type === 'gist') {
      gistURL = loader.config.url;
    }
  });

  const loadGist = () => {
    if (!gistURL) {
      return alert('Please enter a Gist URL first');
    }
    window.location.href = `${window.location.pathname}?gist=${gistURL}`;
    logEvent('loadGist');
  };

  const isNetlify = window.location.host.includes('netlify');

  // ---------------------------------------------------------------------------
  // Embed
  // ---------------------------------------------------------------------------

  const sanitizedConfig = $derived(silentlySanitizeConfig(validatedState.current.mermaid));
  // Deliberate initial-value capture: the embed form seeds from the config at
  // mount time and then owns its values.
  // svelte-ignore state_referenced_locally
  const initialConfig = sanitizedConfig;
  const initialTheme = (initialConfig.theme as string | undefined) ?? 'default';
  let theme = $state(initialTheme);
  let look = $state((initialConfig.look as string | undefined) ?? 'classic');
  let mode = $state<EmbedMode>(isDarkTheme(initialTheme) ? 'dark' : 'light');
  let controls = $state(true);
  let grid = $state(true);
  let width = $state('100%');
  let height = $state('480');
  let embedConfigOpen = $state(false);
  let pngSizeOpen = $state(false);
  let previewLoaded = $state(false);

  // The expensive half (config sanitize + pako serialize) is independent of
  // width/height, so typing in the size inputs only re-runs the snippet strings.
  const embedUrls = $derived(
    buildEmbedUrls({
      code: validatedState.current.code,
      config: sanitizedConfig,
      controls,
      grid,
      host: window.location.origin + base,
      look,
      mode,
      theme
    })
  );
  const snippets = $derived(buildEmbedSnippets(embedUrls, { height, width }));

  // Re-cover the preview only when its document URL (origin+path+query)
  // changes. Code edits arrive as same-document hash changes, which the embed
  // page applies live via hashchange: the iframe never reloads, so no load
  // event would ever clear the cover. Canvas pan/zoom leaves the URL untouched
  // entirely, and must not re-cover either.
  let lastPreviewDocument = '';
  $effect(() => {
    const url = new URL(embedUrls.url);
    const documentUrl = url.origin + url.pathname + url.search;
    if (documentUrl !== lastPreviewDocument) {
      lastPreviewDocument = documentUrl;
      previewLoaded = false;
    }
  });
</script>

<Card isOpen isClosable={false} title="Share" icon={{ component: ShareIcon, class: 'size-4' }}>
  {#snippet actions()}
    {#if onClose}
      <Button size="icon" variant="ghost" onclick={onClose} title="Close share panel">
        <CloseIcon />
      </Button>
    {/if}
  {/snippet}
  <!-- Typographic system, shared by every section below:
       section title h2 (text-base font-semibold text-accent),
       subsection title h3 (icon size-3.5 + uppercase text-xs text-foreground),
       description p (pl-5 text-xs text-muted-foreground), then controls.
       Copy/download/open actions are icon-only buttons right after the h3,
       matching the navbar Bookmarks button scheme (variant default, size icon);
       a trailing settings gear (ml-auto) toggles that block's collapsible and
       switches to the secondary variant while expanded, like the navbar panels. -->
  <div class="h-full overflow-y-auto p-4">
    <div class="flex flex-col gap-8">
      <section class="flex flex-col gap-3">
        <h2 class="text-base font-semibold text-accent">Link</h2>
        <div class="flex flex-col gap-2">
          <div class="flex items-center gap-1">
            <h3
              class="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-foreground uppercase">
              <EditorLinkIcon class="size-3.5" />
              Editor link
            </h3>
            <CopyButton
              iconOnly
              label="Copy editor link"
              onclick={() => copyToClipboard(editorUrl)} />
          </div>
          <p class="pl-5 text-xs text-muted-foreground">
            Edit your diagram from anywhere, on any device — it lives on your own server.
          </p>
          <CopyInput value={editorUrl} showCopy={false} />
        </div>
        <div class="flex flex-col gap-2">
          <div class="flex items-center gap-1">
            <h3
              class="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-foreground uppercase">
              <ViewLinkIcon class="size-3.5" />
              View-only link
            </h3>
            <CopyButton
              iconOnly
              label="Copy view-only link"
              onclick={() => copyToClipboard(urls.current.view)} />
          </div>
          <p class="pl-5 text-xs text-muted-foreground">
            Share a read-only view of the current diagram — no editing controls.
          </p>
          <CopyInput value={urls.current.view} showCopy={false} />
        </div>
      </section>

      <Separator />

      <section class="flex flex-col gap-3">
        <div class="flex items-center gap-2">
          <h2 class="text-base font-semibold text-accent">Embed</h2>
          <Button
            variant={embedConfigOpen ? 'secondary' : 'default'}
            size="icon"
            class="ml-auto"
            title={embedConfigOpen ? 'Hide embed options' : 'Show embed options'}
            onclick={() => {
              embedConfigOpen = !embedConfigOpen;
              previewLoaded = false;
            }}>
            <SettingsIcon class={['transition-transform', embedConfigOpen && 'rotate-90']} />
          </Button>
        </div>
        {#if embedConfigOpen}
          <!-- The cover keeps the pre-load blank frames in the panel background
               color (an unloaded iframe would otherwise flash white). -->
          <div class="relative aspect-video w-full overflow-hidden rounded-lg border bg-background">
            <iframe
              data-testid={TID.embedPreview}
              src={embedUrls.url}
              title="Embed preview"
              class="h-full w-full"
              sandbox={EMBED_IFRAME_SANDBOX}
              onload={() => (previewLoaded = true)}></iframe>
            {#if !previewLoaded}
              <div class="absolute inset-0 bg-background"></div>
            {/if}
          </div>
          <div class="grid grid-cols-2 gap-3">
            <label class="flex flex-col gap-1.5 text-sm">
              Theme
              <select
                bind:value={theme}
                class="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground">
                {#each MERMAID_THEMES as themeName (themeName)}
                  <option value={themeName}>{themeName}</option>
                {/each}
              </select>
            </label>
            <label class="flex flex-col gap-1.5 text-sm">
              Look
              <select
                bind:value={look}
                class="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground">
                {#each MERMAID_LOOKS as lookName (lookName)}
                  <option value={lookName}>{lookName}</option>
                {/each}
              </select>
            </label>
            <label class="flex flex-col gap-1.5 text-sm">
              Width
              <Input bind:value={width} />
            </label>
            <label class="flex flex-col gap-1.5 text-sm">
              Height
              <Input bind:value={height} />
            </label>
          </div>
          <div class="flex flex-wrap items-center gap-4">
            <ToggleGroup.Root
              type="single"
              variant="outline"
              value={mode}
              onValueChange={(value) => {
                if (value === 'light' || value === 'dark') {
                  mode = value;
                }
              }}>
              <ToggleGroup.Item value="light">Light</ToggleGroup.Item>
              <ToggleGroup.Item value="dark">Dark</ToggleGroup.Item>
            </ToggleGroup.Root>
            <label class="flex items-center gap-2 text-sm">
              <Switch bind:checked={controls} />
              Controls
            </label>
            <label class="flex items-center gap-2 text-sm">
              <Switch bind:checked={grid} />
              Grid
            </label>
          </div>
        {/if}
        <div class="flex flex-col gap-2">
          <div class="flex items-center gap-1">
            <h3
              class="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-foreground uppercase">
              <IframeIcon class="size-3.5" />
              iframe
            </h3>
            <CopyButton
              iconOnly
              label="Copy iframe snippet"
              onclick={() => copyToClipboard(snippets.iframe)} />
          </div>
          <textarea
            data-testid={TID.embedSnippet}
            readonly
            rows="4"
            class="w-full rounded-md border border-input bg-background p-2 font-mono text-xs text-foreground"
            value={snippets.iframe}></textarea>
        </div>
        <div class="flex flex-col gap-2">
          <div class="flex items-center gap-1">
            <h3
              class="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-foreground uppercase">
              <WebComponentIcon class="size-3.5" />
              Web component
            </h3>
            <CopyButton
              iconOnly
              label="Copy web component snippet"
              onclick={() => copyToClipboard(snippets.webComponent)} />
          </div>
          <textarea
            readonly
            rows="4"
            class="w-full rounded-md border border-input bg-background p-2 font-mono text-xs text-foreground"
            value={snippets.webComponent}></textarea>
        </div>
      </section>

      <Separator />

      <section class="flex flex-col gap-3">
        <h2 class="text-base font-semibold text-accent">Image</h2>
        <div class="flex flex-col gap-2">
          <div class="flex items-center gap-1">
            <h3
              class="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-foreground uppercase">
              <PngIcon class="size-3.5" />
              PNG
            </h3>
            {#if isClipboardAvailable()}
              <CopyButton iconOnly label="Copy image" onclick={onCopyClipboard} />
            {/if}
            <Button
              variant="default"
              size="icon"
              title="Download PNG"
              onclick={onDownloadPNG}
              data-testid="download-PNG">
              <DownloadIcon />
            </Button>
            <a
              class={buttonVariants({ variant: 'default', size: 'icon' })}
              target="_blank"
              rel="noreferrer"
              href={urls.current.png}
              title="Open PNG in a new tab">
              <ExternalLinkIcon />
            </a>
            <Button
              variant={pngSizeOpen ? 'secondary' : 'default'}
              size="icon"
              class="ml-auto"
              title={pngSizeOpen ? 'Hide PNG size options' : 'Show PNG size options'}
              onclick={() => (pngSizeOpen = !pngSizeOpen)}>
              <SettingsIcon class={['transition-transform', pngSizeOpen && 'rotate-90']} />
            </Button>
          </div>
          {#if pngSizeOpen}
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-sm">Size</span>
              <ToggleGroup.Root type="single" variant="outline" bind:value={imageSize.mode}>
                <ToggleGroup.Item value="auto">Auto</ToggleGroup.Item>
                <ToggleGroup.Item value="width">Width</ToggleGroup.Item>
                <ToggleGroup.Item value="height">Height</ToggleGroup.Item>
              </ToggleGroup.Root>
              {#if imageSize.mode !== 'auto'}
                <WidthIcon
                  class={[
                    'size-5 shrink-0 transition-all',
                    imageSize.mode === 'width' && 'rotate-90'
                  ]} />
              {/if}
              <Input
                type="number"
                min="3"
                max="10000"
                disabled={imageSize.mode === 'auto'}
                bind:value={imageSize.size} />
            </div>
          {/if}
        </div>
        <div class="flex flex-col gap-2">
          <div class="flex items-center gap-1">
            <h3
              class="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-foreground uppercase">
              <SvgIcon class="size-3.5" />
              SVG
            </h3>
            <Button
              variant="default"
              size="icon"
              title="Download SVG"
              onclick={() => onDownloadSVG()}
              data-testid="download-SVG">
              <DownloadIcon />
            </Button>
            <a
              class={buttonVariants({ variant: 'default', size: 'icon' })}
              target="_blank"
              rel="noreferrer"
              href={urls.current.svg}
              title="Open SVG in a new tab">
              <ExternalLinkIcon />
            </a>
          </div>
        </div>
        <div class="flex flex-col gap-2">
          <div class="flex items-center gap-1">
            <h3
              class="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-foreground uppercase">
              <MarkdownIcon class="size-3.5" />
              Markdown
            </h3>
            <CopyButton
              iconOnly
              label="Copy Markdown"
              onclick={() => copyToClipboard(urls.current.mdCode)} />
          </div>
          <CopyInput value={urls.current.mdCode} showCopy={false} testID={TID.copyMarkdown} />
          <p class="pl-5 text-xs text-muted-foreground">
            The thumbnail image is generated by this server.
          </p>
        </div>
      </section>

      <Separator />

      <section class="flex flex-col gap-3">
        <h2 class="text-base font-semibold text-accent">Import</h2>
        <div class="flex flex-col gap-2">
          <div class="flex items-center gap-1">
            <h3
              class="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-foreground uppercase">
              <GithubIcon class="size-3.5" />
              GitHub Gist
            </h3>
            <Button variant="default" size="icon" title="Load Gist" onclick={loadGist}>
              <GistIcon />
            </Button>
          </div>
          <p class="pl-5 text-xs text-muted-foreground">Load a diagram from a GitHub Gist.</p>
          <Input type="url" bind:value={gistURL} placeholder="Paste a GitHub Gist URL" />
          {#if isNetlify}
            <div class="flex w-full items-center justify-center">
              <a class="text-sm text-gray-500 underline" href="https://netlify.com">
                This site is powered by Netlify
              </a>
            </div>
          {/if}
        </div>
      </section>
    </div>
  </div>
</Card>
