export type Mode = "static" | "dynamic";

export interface AppConfig {
  mode: Mode;
  staticUsernames?: string[];
  schedule: string; // cron expression
  proxy?: string; // http://127.0.0.1:7890
  maxPerUser: number; // how many recent tweets to check
  concurrency: number; // planned concurrency (may be capped internally)
}

export interface EnvSecrets {
  X_BEARER_TOKEN?: string;
  X_API_KEY?: string;
  X_API_SECRET?: string;
  X_ACCESS_TOKEN?: string;
  X_ACCESS_SECRET?: string;
}

export interface UserEntity {
  id: string;
  username: string;
  name?: string;
  last_seen_at?: number;
}

export interface TweetEntity {
  id: string;
  user_id: string;
  text: string;
  created_at?: string;
  lang?: string;
  entities_json?: string;
  raw_json?: string;
}