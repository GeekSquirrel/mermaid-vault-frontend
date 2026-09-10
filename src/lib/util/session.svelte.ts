import { goto } from '$app/navigation';
import { base } from '$app/paths';
import { api, setOnUnauthorized, type LoginDto, type SetupDto, type User } from '$lib/services/api';

class SessionState {
  authEnabled = $state<boolean>(false);
  localEnabled = $state<boolean>(false);
  oidcEnabled = $state<boolean>(false);
  needsSetup = $state<boolean>(false);
  user = $state<User | null>(null);
  loading = $state<boolean>(true);
  initialized = $state<boolean>(false);

  constructor() {
    setOnUnauthorized(() => {
      this.clearUser();
      if (typeof window !== 'undefined' && this.authEnabled) {
        if (!window.location.pathname.endsWith('/login')) {
          const returnTo = encodeURIComponent(window.location.pathname + window.location.search);
          void goto(`${base}/login?returnTo=${returnTo}`);
        }
      }
    });
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    this.loading = true;
    try {
      const status = await api.auth.getStatus();
      this.authEnabled = status.authEnabled;
      this.localEnabled = status.localEnabled;
      this.oidcEnabled = status.oidcEnabled;
      this.needsSetup = status.needsSetup;

      if (this.authEnabled) {
        try {
          const res = await api.auth.getMe();
          this.user = res.user;
        } catch {
          this.user = null;
        }
      }
    } catch {
      // Backend unreachable or auth disabled: keep default false
      this.authEnabled = false;
    } finally {
      this.loading = false;
      this.initialized = true;
    }
  }

  async login(credentials: LoginDto): Promise<User> {
    const res = await api.auth.login(credentials);
    this.user = res.user;
    return res.user;
  }

  async setup(data: SetupDto): Promise<User> {
    const res = await api.auth.setup(data);
    this.user = res.user;
    this.needsSetup = false;
    return res.user;
  }

  async logout(): Promise<void> {
    try {
      await api.auth.logout();
    } finally {
      this.clearUser();
      if (typeof window !== 'undefined') {
        void goto(`${base}/login`);
      }
    }
  }

  clearUser(): void {
    this.user = null;
  }
}

export const session = new SessionState();
