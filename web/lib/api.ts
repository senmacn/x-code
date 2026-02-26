import type {
  AppConfig,
  DailyStat,
  FetchStatus,
  TweetFilters,
  TweetsResponse,
  TweetStats,
  User,
} from "./types";

const BASE = "/api";

const get = async <T>(url: string): Promise<T> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json() as Promise<T>;
};

const post = async <T>(url: string, body?: unknown): Promise<T> => {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || `API error ${res.status}`);
  }
  return res.json() as Promise<T>;
};

const put = async <T>(url: string, body: unknown): Promise<T> => {
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || `API error ${res.status}`);
  }
  return res.json() as Promise<T>;
};

const del = async <T>(url: string): Promise<T> => {
  const res = await fetch(url, { method: "DELETE" });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json() as Promise<T>;
};

const buildQuery = (params: Record<string, string | number | undefined>) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") q.set(k, String(v));
  }
  return q.toString() ? `?${q.toString()}` : "";
};

export const api = {
  status: () => get<FetchStatus>(`${BASE}/status`),

  tweets: {
    list: (filters: TweetFilters = {}) =>
      get<TweetsResponse>(`${BASE}/tweets${buildQuery(filters as Record<string, string | number | undefined>)}`),
    stats: () => get<TweetStats>(`${BASE}/tweets/stats`),
  },

  users: {
    list: () => get<{ users: User[] }>(`${BASE}/users`),
    add: (username: string) => post<{ ok: boolean }>(`${BASE}/users`, { username }),
    remove: (username: string) => del<{ ok: boolean }>(`${BASE}/users/${username}`),
  },

  analytics: {
    daily: (days = 30) => get<{ data: DailyStat[] }>(`${BASE}/analytics/daily?days=${days}`),
    users: () => get<{ data: User[] }>(`${BASE}/analytics/users`),
  },

  config: {
    get: () => get<AppConfig>(`${BASE}/config`),
    update: (config: Partial<AppConfig>) => put<{ ok: boolean }>(`${BASE}/config`, config),
  },

  actions: {
    fetchNow: () => post<{ ok: boolean; message: string }>(`${BASE}/actions/fetch`),
  },
};
