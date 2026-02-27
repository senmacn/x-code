import { TwitterApi } from "twitter-api-v2";
import { logger } from "../utils/logger";
import { Store } from "../data/store";
import { AppConfig, TweetEntity, UserEntity } from "../data/types";
import { getUserByUsername, getUserTweetsSince } from "../clients/xClient";
import { cacheMediaForTweet } from "./mediaCache";

export interface FetchSummary {
  totalUsers: number;
  successUsers: number;
  failedUsers: number;
  rateLimitedUsers: number;
  skippedRateLimitedUsers: number;
  fetchedTweets: number;
}

export interface FetchProgress extends FetchSummary {
  processedUsers: number;
  username?: string;
}

const DEFAULT_RATE_LIMIT_BACKOFF_MS = 15 * 60 * 1000;

const toEpochMs = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 1e12 ? value * 1000 : value;
  }
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return n < 1e12 ? n * 1000 : n;
  }
  return undefined;
};

const extractRateLimitResetAt = (err: any): number | undefined => {
  const headers = err?.headers ?? err?.response?.headers ?? {};
  const candidates = [
    err?.rateLimit?.reset,
    headers["x-rate-limit-reset"],
    headers["x-app-limit-24hour-reset"],
    err?.data?.rate_limit_reset,
  ];
  for (const candidate of candidates) {
    const parsed = toEpochMs(candidate);
    if (parsed) return parsed;
  }
  return undefined;
};

const getStatusCode = (err: any): number | undefined => {
  const raw = err?.code ?? err?.status ?? err?.response?.status;
  if (typeof raw === "number") return raw;
  if (typeof raw === "string") {
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
};

const normalizeUsername = (username: string) => username.replace(/^@/, "").trim();

export async function fetchForUsernames(
  client: TwitterApi,
  store: Store,
  usernames: string[],
  maxPerUser: number,
  concurrency = 3,
  appConfig?: AppConfig,
  hooks?: {
    onProgress?: (progress: FetchProgress) => void;
  }
): Promise<FetchSummary> {
  const summary: FetchSummary = {
    totalUsers: usernames.length,
    successUsers: 0,
    failedUsers: 0,
    rateLimitedUsers: 0,
    skippedRateLimitedUsers: 0,
    fetchedTweets: 0,
  };
  let processedUsers = 0;
  store.cleanupExpiredUserRateLimits();
  const emitProgress = (username?: string) => {
    hooks?.onProgress?.({
      ...summary,
      processedUsers,
      username,
    });
  };

  const fetchOne = async (username: string) => {
    const uname = normalizeUsername(username);
    const unameKey = uname.toLowerCase();
    const blockedUntil = store.getUserRateLimit(unameKey);
    if (blockedUntil && blockedUntil > Date.now()) {
      summary.skippedRateLimitedUsers += 1;
      logger.info(
        { username: uname, retryAt: new Date(blockedUntil).toISOString() },
        "用户仍处于限流冷却期，跳过本轮拉取"
      );
      processedUsers += 1;
      emitProgress(uname);
      return;
    }

    try {
      const user = await getUserByUsername(client, uname);
      const userEntity: UserEntity = { id: user.id, username: user.username, name: user.name, last_seen_at: Date.now() };
      store.upsertUser(userEntity);

      const sinceId = store.getLastTweetId(user.id);
      const timelineItems = await getUserTweetsSince(client, user.id, sinceId, maxPerUser);
      if (!timelineItems || timelineItems.length === 0) {
        summary.successUsers += 1;
        logger.info({ username: uname }, "无增量推文");
        store.clearUserRateLimit(unameKey);
        processedUsers += 1;
        emitProgress(uname);
        return;
      }

      const entities: TweetEntity[] = [];
      for (const { tweet, media } of timelineItems) {
        entities.push({
          id: tweet.id,
          user_id: user.id,
          text: tweet.text,
          created_at: tweet.created_at,
          lang: tweet.lang,
          media_json: media.length ? JSON.stringify(media) : undefined,
          entities_json: tweet.entities ? JSON.stringify(tweet.entities) : undefined,
          raw_json: JSON.stringify(tweet),
        });
      }
      store.saveTweets(entities);

      if (appConfig) {
        for (const { tweet, media } of timelineItems) {
          if (!media.length) continue;
          const cached = await cacheMediaForTweet({
            store,
            config: appConfig,
            username: user.username,
            tweetId: tweet.id,
            media,
          });
          if (cached.changed) {
            store.updateTweetMediaJson(tweet.id, JSON.stringify(cached.media));
          }
        }
      }

      summary.successUsers += 1;
      summary.fetchedTweets += entities.length;
      store.clearUserRateLimit(unameKey);

      // 更新最新 tweet id（时间通常已按降序返回）
      const latestId = entities[0]?.id;
      if (latestId) store.setLastTweetId(user.id, latestId);

      logger.info({ username: uname, count: entities.length }, "拉取并保存推文完毕");
      processedUsers += 1;
      emitProgress(uname);
    } catch (err: any) {
      const status = getStatusCode(err);
      const title = err?.data?.title;
      const detail = err?.data?.detail;
      const msg = detail || title || err?.message || String(err);

      if (status === 429) {
        summary.rateLimitedUsers += 1;
        const resetAt = extractRateLimitResetAt(err) ?? Date.now() + DEFAULT_RATE_LIMIT_BACKOFF_MS;
        store.setUserRateLimit(unameKey, resetAt, msg);
        logger.warn(
          { username: uname, status, retryAt: new Date(resetAt).toISOString(), error: msg },
          "用户触发限流，已进入冷却期"
        );
        processedUsers += 1;
        emitProgress(uname);
        return;
      }

      summary.failedUsers += 1;
      logger.error({ username: uname, status, error: msg }, "拉取用户推文失败");
      processedUsers += 1;
      emitProgress(uname);
    }
  };

  for (let i = 0; i < usernames.length; i += concurrency) {
    const chunk = usernames.slice(i, i + concurrency);
    await Promise.allSettled(chunk.map((u) => fetchOne(u)));
  }

  return summary;
}
