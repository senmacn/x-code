import { TwitterApi } from "twitter-api-v2";
import { logger } from "../utils/logger";
import { Store } from "../data/store";
import { TweetEntity, UserEntity } from "../data/types";
import { getUserByUsername, getUserTweetsSince } from "../clients/xClient";

export interface FetchSummary {
  totalUsers: number;
  successUsers: number;
  failedUsers: number;
  rateLimitedUsers: number;
  skippedRateLimitedUsers: number;
  fetchedTweets: number;
}

const userRateLimitUntil = new Map<string, number>();
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
  concurrency = 3
): Promise<FetchSummary> {
  const summary: FetchSummary = {
    totalUsers: usernames.length,
    successUsers: 0,
    failedUsers: 0,
    rateLimitedUsers: 0,
    skippedRateLimitedUsers: 0,
    fetchedTweets: 0,
  };

  const fetchOne = async (username: string) => {
    const uname = normalizeUsername(username);
    const unameKey = uname.toLowerCase();
    const blockedUntil = userRateLimitUntil.get(unameKey);
    if (blockedUntil && blockedUntil > Date.now()) {
      summary.skippedRateLimitedUsers += 1;
      logger.info(
        { username: uname, retryAt: new Date(blockedUntil).toISOString() },
        "用户仍处于限流冷却期，跳过本轮拉取"
      );
      return;
    }

    try {
      const user = await getUserByUsername(client, uname);
      const userEntity: UserEntity = { id: user.id, username: user.username, name: user.name, last_seen_at: Date.now() };
      store.upsertUser(userEntity);

      const sinceId = store.getLastTweetId(user.id);
      const tweets = await getUserTweetsSince(client, user.id, sinceId, maxPerUser);
      if (!tweets || tweets.length === 0) {
        summary.successUsers += 1;
        logger.info({ username: uname }, "无增量推文");
        return;
      }

      const entities: TweetEntity[] = tweets.map((t) => ({
        id: t.id,
        user_id: user.id,
        text: t.text,
        created_at: t.created_at,
        lang: t.lang,
        entities_json: t.entities ? JSON.stringify(t.entities) : undefined,
        raw_json: JSON.stringify(t),
      }));
      store.saveTweets(entities);
      summary.successUsers += 1;
      summary.fetchedTweets += entities.length;
      userRateLimitUntil.delete(unameKey);

      // 更新最新 tweet id（时间通常已按降序返回）
      const latestId = entities[0]?.id;
      if (latestId) store.setLastTweetId(user.id, latestId);

      logger.info({ username: uname, count: entities.length }, "拉取并保存推文完毕");
    } catch (err: any) {
      const status = getStatusCode(err);
      const title = err?.data?.title;
      const detail = err?.data?.detail;
      const msg = detail || title || err?.message || String(err);

      if (status === 429) {
        summary.rateLimitedUsers += 1;
        const resetAt = extractRateLimitResetAt(err) ?? Date.now() + DEFAULT_RATE_LIMIT_BACKOFF_MS;
        userRateLimitUntil.set(unameKey, resetAt);
        logger.warn(
          { username: uname, status, retryAt: new Date(resetAt).toISOString(), error: msg },
          "用户触发限流，已进入冷却期"
        );
        return;
      }

      summary.failedUsers += 1;
      logger.error({ username: uname, status, error: msg }, "拉取用户推文失败");
    }
  };

  for (let i = 0; i < usernames.length; i += concurrency) {
    const chunk = usernames.slice(i, i + concurrency);
    await Promise.allSettled(chunk.map((u) => fetchOne(u)));
  }

  return summary;
}
