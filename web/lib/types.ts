export type MonitorStatus = "active" | "paused" | "removed" | "blocked_or_not_found";

export interface Tweet {
  id: string;
  user_id: string;
  text: string;
  created_at?: string;
  lang?: string;
  media_json?: string;
  entities_json?: string;
  raw_json?: string;
  ingest_source?: "direct" | "backfill" | "reference";
  captured_at?: number;
  monitor_status_at_capture?: "active_target" | "inactive_target" | "non_target_reference" | "unknown";
  username: string;
  user_name?: string;
  user_avatar_url?: string;
  user_monitor_status?: MonitorStatus;
  user_is_priority?: boolean;
  references?: TweetReference[];
}

export interface ReferencedTweet {
  id: string;
  author_id?: string;
  username?: string;
  name?: string;
  text?: string;
  created_at?: string;
  lang?: string;
  media_json?: string;
  raw_json?: string;
  unavailable_reason?: string;
}

export interface TweetReference {
  ref_tweet_id: string;
  ref_type: "quoted" | "replied_to" | "retweeted" | "link" | string;
  source: "referenced_tweets" | "url";
  url?: string;
  tweet: ReferencedTweet;
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
  avatar_url?: string;
  last_seen_at?: number;
  monitor_status?: MonitorStatus;
  monitoring_started_at?: number;
  monitoring_ended_at?: number;
  current_target?: boolean;
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
  includeHistorical?: number;
  limit?: number;
  offset?: number;
}
