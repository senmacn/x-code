export interface Tweet {
  id: string;
  user_id: string;
  text: string;
  created_at?: string;
  lang?: string;
  media_json?: string;
  entities_json?: string;
  raw_json?: string;
  username: string;
  user_name?: string;
}

export interface MediaCacheConfig {
  enabled: boolean;
  rootDir: string;
  cacheForPriorityOnly: boolean;
  includeVideoFiles: boolean;
  requestTimeoutMs: number;
  maxDiskUsage: number;
  ttlDays: number;
  cleanupCron: string;
}

export interface User {
  id: string;
  username: string;
  name?: string;
  last_seen_at?: number;
  count: number;
}

export interface TweetStats {
  total: number;
  today: number;
}

export interface FetchStatus {
  isRunning: boolean;
  lastRunAt: string | null;
  lastRunResult: "idle" | "success" | "error";
  lastRunMessage: string;
  nextRunAt: string | null;
  schedule: string;
}

export interface AppConfig {
  mode: "static" | "dynamic";
  staticUsernames?: string[];
  priorityUsernames?: string[];
  schedule: string;
  proxy?: string;
  maxPerUser: number;
  concurrency: number;
  mediaCache?: MediaCacheConfig;
}

export interface DailyStat {
  date: string;
  count: number;
}

export interface TweetsResponse {
  tweets: Tweet[];
  total: number;
}

export interface TweetFilters {
  username?: string;
  since?: string;
  until?: string;
  contains?: string;
  lang?: string;
  limit?: number;
  offset?: number;
}
