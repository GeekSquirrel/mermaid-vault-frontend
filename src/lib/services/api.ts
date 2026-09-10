import type { HistoryEntry, State } from '$lib/types';

export interface Diagram {
  id: string;
  title: string;
  code: string;
  workspace_id?: string | null;
  created_at: number;
  updated_at: number;
}

export interface CreateDiagramDto {
  title: string;
  code: string;
  workspace_id?: string | null;
}

export interface UpdateDiagramDto {
  title?: string;
  code?: string;
  workspace_id?: string | null;
}

export interface Workspace {
  id: string;
  name: string;
  created_at: number;
  updated_at: number;
}

export interface CreateWorkspaceDto {
  name: string;
}

export interface UpdateWorkspaceDto {
  name: string;
}

export interface CreateHistoryDto {
  id?: string;
  name: string;
  diagramId?: string | null;
  diagram_id?: string | null;
  state: State | Record<string, unknown>;
  time?: number;
  type?: string;
}

export interface UpdateHistoryDto {
  name?: string;
  state?: State | Record<string, unknown>;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

export interface User {
  id: string;
  username: string;
  display_name?: string | null;
  email?: string | null;
  created_at: number;
  updated_at: number;
}

export interface AuthStatus {
  authEnabled: boolean;
  localEnabled: boolean;
  oidcEnabled: boolean;
  needsSetup: boolean;
}

export interface SetupDto {
  username: string;
  password: string;
  displayName?: string;
  email?: string;
}

export interface LoginDto {
  username: string;
  password: string;
}

export interface ApiToken {
  id: string;
  user_id: string;
  name: string;
  token_prefix: string;
  created_at: number;
  last_used_at?: number | null;
}

export interface CreatedApiToken extends ApiToken {
  token: string;
}

export type PreviewTheme = 'light' | 'dark';

export interface SavePreviewDto {
  theme: PreviewTheme;
  /** sha256 hex of the diagram code the preview was rendered from */
  codeHash: string;
  svg: string;
}

let onUnauthorizedCallback: (() => void) | null = null;
export function setOnUnauthorized(cb: () => void): void {
  onUnauthorizedCallback = cb;
}

declare global {
  interface Window {
    APP_CONFIG?: {
      apiBaseUrl?: string;
    };
  }
}

export function getApiBaseUrl(): string {
  let url = '';
  if (typeof window !== 'undefined' && window.APP_CONFIG?.apiBaseUrl !== undefined) {
    url = window.APP_CONFIG.apiBaseUrl.trim();
  }
  if (!url) {
    url = (import.meta.env.VITE_API_BASE_URL || '').trim();
  }
  if (!url) {
    url = '/api';
  }
  return url.replace(/\/+$/, '');
}

export function buildApiUrl(path: string): string {
  const baseUrl = getApiBaseUrl();
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  let fullUrl = `${baseUrl}${normalizedPath}`;

  if (fullUrl.startsWith('/')) {
    if (
      typeof window !== 'undefined' &&
      window.location?.origin &&
      window.location.origin.startsWith('http')
    ) {
      fullUrl = `${window.location.origin}${fullUrl}`;
    } else if (
      typeof process !== 'undefined' &&
      (process.env.NODE_ENV === 'test' || process.env.VITEST)
    ) {
      fullUrl = `http://localhost:8080${fullUrl}`;
    }
  }

  return fullUrl;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const fullUrl = buildApiUrl(path);

  const response = await fetch(fullUrl, {
    credentials: 'same-origin',
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers
    }
  });

  if (response.status === 401) {
    const isAuthEndpoint =
      path.startsWith('/auth') ||
      path.startsWith('/api/auth') ||
      path.includes('login') ||
      path.includes('status');
    if (!isAuthEndpoint && onUnauthorizedCallback) {
      onUnauthorizedCallback();
    }
  }

  const json: ApiResponse<T> = await response.json().catch(() => {
    throw new Error(`HTTP Error ${response.status}: Failed to parse server response`);
  });

  if (!response.ok || !json.success || json.error) {
    const errorMsg = json.error?.message || `Request failed with status ${response.status}`;
    const err = new Error(errorMsg);
    (err as unknown as { status: number }).status = response.status;
    throw err;
  }

  return json.data as T;
}

type PreviewKind = 'diagrams' | 'history';

/** Fetch the stored server-side preview SVG; null when missing or stale (404). */
async function fetchPreview(
  kind: PreviewKind,
  id: string,
  theme: PreviewTheme
): Promise<string | null> {
  const url = buildApiUrl(`/${kind}/${encodeURIComponent(id)}/preview.svg?theme=${theme}`);
  const response = await fetch(url);
  if (!response.ok) {
    return null;
  }
  return response.text();
}

/** Uploads are deduplicated per resource+theme so a full grid of cards does not flood the backend. */
const inFlightUploads = new Set<string>();

async function uploadPreview(kind: PreviewKind, id: string, dto: SavePreviewDto): Promise<boolean> {
  const key = `${kind}:${id}:${dto.theme}`;
  if (inFlightUploads.has(key)) {
    return false;
  }
  inFlightUploads.add(key);
  try {
    await request<{ saved: boolean }>(`/${kind}/${encodeURIComponent(id)}/preview`, {
      method: 'PUT',
      body: JSON.stringify(dto)
    });
    return true;
  } catch {
    return false;
  } finally {
    inFlightUploads.delete(key);
  }
}

export const api = {
  auth: {
    createToken: (data: { name: string }): Promise<CreatedApiToken> =>
      request<CreatedApiToken>('/auth/tokens', {
        body: JSON.stringify(data),
        method: 'POST'
      }),
    deleteToken: (id: string): Promise<{ deleted: boolean }> =>
      request<{ deleted: boolean }>(`/auth/tokens/${encodeURIComponent(id)}`, {
        method: 'DELETE'
      }),
    getMe: (): Promise<{ user: User }> => request<{ user: User }>('/auth/me'),
    getStatus: (): Promise<AuthStatus> => request<AuthStatus>('/auth/status'),
    listTokens: (): Promise<ApiToken[]> => request<ApiToken[]>('/auth/tokens'),
    login: (data: LoginDto): Promise<{ user: User }> =>
      request<{ user: User }>('/auth/login', {
        body: JSON.stringify(data),
        method: 'POST'
      }),
    logout: (): Promise<{ loggedOut: boolean }> =>
      request<{ loggedOut: boolean }>('/auth/logout', {
        method: 'POST'
      }),
    setup: (data: SetupDto): Promise<{ user: User }> =>
      request<{ user: User }>('/auth/setup', {
        body: JSON.stringify(data),
        method: 'POST'
      })
  },

  clearHistoryEntries: (
    type = 'manual',
    diagramId?: string | null
  ): Promise<{ cleared: boolean }> => {
    let path = `/history?type=${encodeURIComponent(type)}`;
    if (diagramId !== undefined) {
      path += `&diagramId=${encodeURIComponent(diagramId || 'default')}`;
    }
    return request<{ cleared: boolean }>(path, {
      method: 'DELETE'
    });
  },

  createDiagram: (data: CreateDiagramDto): Promise<Diagram> =>
    request<Diagram>('/diagrams', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  createHistoryEntry: (data: CreateHistoryDto): Promise<HistoryEntry> =>
    request<HistoryEntry>('/history', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  createWorkspace: (data: CreateWorkspaceDto): Promise<Workspace> =>
    request<Workspace>('/workspaces', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  deleteDiagram: (id: string): Promise<{ deleted: boolean }> =>
    request<{ deleted: boolean }>(`/diagrams/${id}`, {
      method: 'DELETE'
    }),

  deleteHistoryEntry: (id: string): Promise<{ deleted: boolean }> =>
    request<{ deleted: boolean }>(`/history/${id}`, {
      method: 'DELETE'
    }),

  deleteWorkspace: (id: string): Promise<{ deleted: boolean }> =>
    request<{ deleted: boolean }>(`/workspaces/${id}`, {
      method: 'DELETE'
    }),

  getBookmarkPreview: (id: string, theme: PreviewTheme): Promise<string | null> =>
    fetchPreview('history', id, theme),

  getDiagram: (id: string): Promise<Diagram> => request<Diagram>(`/diagrams/${id}`),

  getDiagramPreview: (id: string, theme: PreviewTheme): Promise<string | null> =>
    fetchPreview('diagrams', id, theme),

  getDiagrams: (): Promise<Diagram[]> => request<Diagram[]>('/diagrams'),

  getHistoryEntries: (type = 'manual', diagramId?: string | null): Promise<HistoryEntry[]> => {
    let path = `/history?type=${encodeURIComponent(type)}`;
    if (diagramId !== undefined) {
      path += `&diagramId=${encodeURIComponent(diagramId || 'default')}`;
    }
    return request<HistoryEntry[]>(path);
  },

  getWorkspaces: (): Promise<Workspace[]> => request<Workspace[]>('/workspaces'),

  updateDiagram: (id: string, data: UpdateDiagramDto): Promise<Diagram> =>
    request<Diagram>(`/diagrams/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    }),

  updateHistoryEntry: (id: string, data: UpdateHistoryDto): Promise<HistoryEntry> =>
    request<HistoryEntry>(`/history/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    }),

  updateWorkspace: (id: string, data: UpdateWorkspaceDto): Promise<Workspace> =>
    request<Workspace>(`/workspaces/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    }),

  updateWorkspaceOrder: (order: string[]): Promise<{ updated: boolean }> =>
    request<{ updated: boolean }>('/workspaces/order', {
      method: 'PUT',
      body: JSON.stringify({ order })
    }),

  uploadBookmarkPreview: (id: string, dto: SavePreviewDto): Promise<boolean> =>
    uploadPreview('history', id, dto),

  uploadDiagramPreview: (id: string, dto: SavePreviewDto): Promise<boolean> =>
    uploadPreview('diagrams', id, dto)
};
