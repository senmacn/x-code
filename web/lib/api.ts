import type {
  AppConfig,
  DailyStat,
  FetchStatus,
  TweetFilters,
  TweetsResponse,
  TweetStats,
  User,
} from "./types";

const REQUEST_TIMEOUT_MS = 12_000;

const normalizeBase = (raw?: string): string => {
  if (!raw) return "/api";
  const clean = raw.trim().replace(/\/+$/, "");
  return clean.endsWith("/api") ? clean : `${clean}/api`;
};

const BASE = normalizeBase(process.env.NEXT_PUBLIC_API_BASE);

const buildQuery = (params: Record<string, string | number | undefined | null>) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  }
  return q.toString() ? `?${q.toString()}` : "";
};

const parsePayload = async (res: Response): Promise<unknown> => {
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return res.json().catch(() => null);
  }
  const text = await res.text().catch(() => "");
  return text || null;
};

const pickErrorMessage = (status: number, payload: unknown): string => {
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    const candidate = record.error ?? record.message ?? record.detail;
    if (typeof candidate === "string" && candidate.trim()) return candidate;
  }
  if (typeof payload === "string" && payload.trim()) return payload;
  return `API error ${status}`;
};

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      cache: "no-store",
      signal: controller.signal,
      headers: {
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
    });

    const payload = await parsePayload(res);
    if (!res.ok) throw new Error(pickErrorMessage(res.status, payload));
    return (payload as T) ?? ({} as T);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("请求超时，请稍后重试");
    }
    if (error instanceof TypeError) {
      throw new Error("网络连接失败，请确认后端服务可访问");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
};

const get = <T>(path: string) => request<T>(path);
const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined });
const put = <T>(path: string, body: unknown) =>
  request<T>(path, { method: "PUT", body: JSON.stringify(body) });
const del = <T>(path: string) => request<T>(path, { method: "DELETE" });

export const api = {
  status: () => get<FetchStatus>("/status"),

  tweets: {
    list: (filters: TweetFilters = {}) =>
      get<TweetsResponse>(
        `/tweets${buildQuery(filters as Record<string, string | number | undefined | null>)}`
      ),
    stats: () => get<TweetStats>("/tweets/stats"),
  },

  users: {
    list: () => get<{ users: User[] }>("/users"),
    add: (username: string) => post<{ ok: boolean }>("/users", { username }),
    remove: (username: string) => del<{ ok: boolean }>(`/users/${encodeURIComponent(username)}`),
  },

  analytics: {
    daily: (days = 30) => get<{ data: DailyStat[] }>(`/analytics/daily${buildQuery({ days })}`),
    users: () => get<{ data: User[] }>("/analytics/users"),
  },

  config: {
    get: () => get<AppConfig>("/config"),
    update: (config: Partial<AppConfig>) => put<{ ok: boolean }>("/config", config),
  },

  actions: {
    fetchNow: () => post<{ ok: boolean; message: string }>("/actions/fetch"),
  },
};
