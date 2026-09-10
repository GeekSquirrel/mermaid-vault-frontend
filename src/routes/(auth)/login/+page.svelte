<script lang="ts">
  import { Button } from '$/components/ui/button';
  import { Input } from '$/components/ui/input';
  import { session } from '$/util/session.svelte';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import { ModeWatcher } from 'mode-watcher';
  import { Toaster } from '$/components/ui/sonner';
  import { toast } from 'svelte-sonner';
  import { onMount } from 'svelte';
  import { buildApiUrl } from '$lib/services/api';

  // Login form state
  let username = $state('');
  let password = $state('');

  // Setup form state
  let setupUsername = $state('');
  let setupDisplayName = $state('');
  let setupEmail = $state('');
  let setupPassword = $state('');
  let setupConfirmPassword = $state('');

  let submitting = $state(false);
  let errorMessage = $state<string | null>(null);

  const returnTo = $derived(page.url.searchParams.get('returnTo') || `${base}/`);

  onMount(() => {
    void (async () => {
      await session.init();
      if (!session.authEnabled) {
        void goto(returnTo);
        return;
      }
      if (session.user) {
        void goto(returnTo);
      }
    })();
  });

  const handleLogin = async (e: Event) => {
    e.preventDefault();
    if (!username || !password) {
      errorMessage = 'Please enter both username and password.';
      return;
    }

    errorMessage = null;
    submitting = true;
    try {
      await session.login({ username, password });
      toast.success('Signed in successfully');
      void goto(returnTo);
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : 'Invalid credentials';
    } finally {
      submitting = false;
    }
  };

  const handleSetup = async (e: Event) => {
    e.preventDefault();
    if (!setupUsername || setupUsername.trim().length < 3) {
      errorMessage = 'Username must be at least 3 characters long.';
      return;
    }
    if (!setupPassword || setupPassword.length < 8) {
      errorMessage = 'Password must be at least 8 characters long.';
      return;
    }
    if (setupPassword !== setupConfirmPassword) {
      errorMessage = 'Passwords do not match.';
      return;
    }

    errorMessage = null;
    submitting = true;
    try {
      await session.setup({
        username: setupUsername.trim(),
        password: setupPassword,
        displayName: setupDisplayName.trim() || undefined,
        email: setupEmail.trim() || undefined
      });
      toast.success('Admin account created successfully');
      void goto(returnTo);
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : 'Failed to create admin account';
    } finally {
      submitting = false;
    }
  };

  const ssoLoginUrl = $derived(
    buildApiUrl(`/auth/oidc/login?returnTo=${encodeURIComponent(returnTo)}`)
  );
</script>

<ModeWatcher />
<Toaster />

<div class="flex min-h-screen w-full items-center justify-center bg-background p-4">
  <div class="w-full max-w-md rounded-2xl border-2 border-border bg-card p-8 shadow-xl">
    <!-- Header -->
    <div class="mb-6 text-center">
      <div
        class="mx-auto mb-3 flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <svg class="size-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      </div>
      <h1 class="text-2xl font-bold tracking-tight text-foreground">
        {#if session.needsSetup}
          Initial Setup
        {:else}
          Mermaid Vault
        {/if}
      </h1>
      <p class="mt-1 text-sm text-muted-foreground">
        {#if session.needsSetup}
          Create your administrator account to get started
        {:else}
          Sign in to access your diagrams and workspaces
        {/if}
      </p>
    </div>

    <!-- Loading State -->
    {#if session.loading}
      <div class="flex flex-col items-center justify-center py-10">
        <div class="size-8 animate-spin rounded-full border-4 border-primary border-t-transparent">
        </div>
        <p class="mt-4 text-sm text-muted-foreground">Checking authentication status...</p>
      </div>
    {:else}
      <!-- Error Alert -->
      {#if errorMessage}
        <div
          class="mb-5 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {errorMessage}
        </div>
      {/if}

      <!-- Form Mode 1: Initial Setup -->
      {#if session.needsSetup && session.localEnabled}
        <form onsubmit={handleSetup} class="space-y-4">
          <div>
            <label for="setup-username" class="mb-1 block text-sm font-medium text-foreground">
              Username <span class="text-destructive">*</span>
            </label>
            <Input
              id="setup-username"
              type="text"
              placeholder="admin"
              bind:value={setupUsername}
              required
              disabled={submitting} />
          </div>

          <div>
            <label for="setup-display-name" class="mb-1 block text-sm font-medium text-foreground">
              Display Name
            </label>
            <Input
              id="setup-display-name"
              type="text"
              placeholder="Administrator"
              bind:value={setupDisplayName}
              disabled={submitting} />
          </div>

          <div>
            <label for="setup-email" class="mb-1 block text-sm font-medium text-foreground">
              Email
            </label>
            <Input
              id="setup-email"
              type="email"
              placeholder="admin@example.com"
              bind:value={setupEmail}
              disabled={submitting} />
          </div>

          <div>
            <label for="setup-password" class="mb-1 block text-sm font-medium text-foreground">
              Password <span class="text-destructive">*</span>
            </label>
            <Input
              id="setup-password"
              type="password"
              placeholder="Minimum 8 characters"
              bind:value={setupPassword}
              required
              disabled={submitting} />
          </div>

          <div>
            <label
              for="setup-confirm-password"
              class="mb-1 block text-sm font-medium text-foreground">
              Confirm Password <span class="text-destructive">*</span>
            </label>
            <Input
              id="setup-confirm-password"
              type="password"
              placeholder="Re-type your password"
              bind:value={setupConfirmPassword}
              required
              disabled={submitting} />
          </div>

          <Button type="submit" class="w-full" disabled={submitting}>
            {#if submitting}
              Creating account...
            {:else}
              Create Admin Account
            {/if}
          </Button>
        </form>

        <!-- Form Mode 2: Standard Login -->
      {:else}
        {#if session.localEnabled}
          <form onsubmit={handleLogin} class="space-y-4">
            <div>
              <label for="login-username" class="mb-1 block text-sm font-medium text-foreground">
                Username
              </label>
              <Input
                id="login-username"
                type="text"
                placeholder="Username or email"
                bind:value={username}
                required
                disabled={submitting} />
            </div>

            <div>
              <label for="login-password" class="mb-1 block text-sm font-medium text-foreground">
                Password
              </label>
              <Input
                id="login-password"
                type="password"
                placeholder="••••••••"
                bind:value={password}
                required
                disabled={submitting} />
            </div>

            <Button type="submit" class="w-full" disabled={submitting}>
              {#if submitting}
                Signing in...
              {:else}
                Sign In
              {/if}
            </Button>
          </form>
        {/if}

        {#if session.localEnabled && session.oidcEnabled}
          <div class="relative my-5">
            <div class="absolute inset-0 flex items-center">
              <span class="w-full border-t border-border"></span>
            </div>
            <div class="relative flex justify-center text-xs uppercase">
              <span class="bg-card px-2 text-muted-foreground">Or</span>
            </div>
          </div>
        {/if}

        {#if session.oidcEnabled}
          <a
            href={ssoLoginUrl}
            class="flex w-full items-center justify-center gap-2 rounded-md border-2 border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted focus:ring-2 focus:ring-primary focus:outline-none">
            <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
            </svg>
            Sign in with SSO
          </a>
        {/if}
      {/if}
    {/if}
  </div>
</div>
