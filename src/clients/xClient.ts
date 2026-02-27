import TwitterApi, { IClientSettings, TwitterApiTokens, type MediaObjectV2, type TweetV2 } from "twitter-api-v2";
import type { Agent } from "http";
import { logger } from "../utils/logger";
import { EnvSecrets } from "../data/types";

export function createXClient(secrets: EnvSecrets, agent?: Agent): TwitterApi {
  const settings: Partial<IClientSettings> | undefined = agent ? { httpAgent: agent } : undefined;

  // Prefer OAuth1.0a user-context if provided, else fallback to bearer token
  if (secrets.X_API_KEY && secrets.X_API_SECRET && secrets.X_ACCESS_TOKEN && secrets.X_ACCESS_SECRET) {
    logger.info("使用 OAuth1.0a 用户上下文初始化 X 客户端");
    const tokens: TwitterApiTokens = {
      appKey: secrets.X_API_KEY,
      appSecret: secrets.X_API_SECRET,
      accessToken: secrets.X_ACCESS_TOKEN,
      accessSecret: secrets.X_ACCESS_SECRET,
    };
    return new TwitterApi(tokens, settings);
  }

  if (secrets.X_BEARER_TOKEN) {
    logger.info("使用 Bearer Token 初始化 X 客户端（仅部分只读接口可用）");
    return new TwitterApi(secrets.X_BEARER_TOKEN, settings);
  }

  throw new Error("未提供有效的 X 授权信息：请在 .env 中设置 OAuth1.0a 或 Bearer Token");
}

export async function getUserByUsername(client: TwitterApi, username: string) {
  const res = await client.v2.userByUsername(username);
  return res.data;
}

export interface TimelineTweetWithMedia {
  tweet: TweetV2;
  media: MediaObjectV2[];
}

export async function getUserTweetsSince(
  client: TwitterApi,
  userId: string,
  sinceId?: string,
  maxResults = 20
): Promise<TimelineTweetWithMedia[]> {
  const params: Record<string, unknown> = {
    exclude: ["retweets", "replies"],
    max_results: Math.min(Math.max(maxResults, 5), 100),
    "tweet.fields": ["created_at", "lang", "entities"],
    expansions: ["attachments.media_keys"],
    "media.fields": [
      "type",
      "url",
      "preview_image_url",
      "width",
      "height",
      "alt_text",
      "variants",
    ],
  };
  if (sinceId) params.since_id = sinceId;
  const res = await client.v2.userTimeline(userId, params as any);
  const tweets = res.tweets ?? [];
  return tweets.map((tweet) => ({
    tweet,
    media: res.includes.medias(tweet),
  }));
}

export async function getMyFollowings(client: TwitterApi): Promise<string[]> {
  // Requires user-context. If not available, this will throw.
  const me = await client.v2.me();
  // max_results cap is 1000 per page; paginate for users following > 1000 accounts
  const following = await client.v2.following(me.data.id, { max_results: 1000 });
  return (following.data ?? []).map((u) => u.username);
}
