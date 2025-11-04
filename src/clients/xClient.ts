import { TwitterApi } from "twitter-api-v2";
import type { Agent } from "http";
import { logger } from "../utils/logger";
import { EnvSecrets } from "../data/types";

export function createXClient(secrets: EnvSecrets, agent?: Agent) {
  const opts = agent ? { requestOptions: { httpAgent: agent, httpsAgent: agent } } : undefined;

  // Prefer OAuth1.0a user-context if provided, else fallback to bearer token
  if (secrets.X_API_KEY && secrets.X_API_SECRET && secrets.X_ACCESS_TOKEN && secrets.X_ACCESS_SECRET) {
    logger.info("使用 OAuth1.0a 用户上下文初始化 X 客户端");
    return new (TwitterApi as any)({
      appKey: secrets.X_API_KEY,
      appSecret: secrets.X_API_SECRET,
      accessToken: secrets.X_ACCESS_TOKEN,
      accessSecret: secrets.X_ACCESS_SECRET,
    }, opts as any);
  }

  if (secrets.X_BEARER_TOKEN) {
    logger.info("使用 Bearer Token 初始化 X 客户端（仅部分只读接口可用）");
    return new (TwitterApi as any)({ bearerToken: secrets.X_BEARER_TOKEN }, opts as any);
  }

  throw new Error("未提供有效的 X 授权信息：请在 .env 中设置 OAuth1.0a 或 Bearer Token");
}

export async function getUserByUsername(client: TwitterApi, username: string) {
  const res = await client.v2.userByUsername(username);
  return res.data;
}

export async function getUserTweetsSince(client: TwitterApi, userId: string, sinceId?: string, maxResults = 20) {
  const params: any = {
    exclude: ["retweets", "replies"],
    max_results: Math.min(Math.max(maxResults, 5), 100),
    "tweet.fields": ["created_at", "lang", "entities"],
  };
  if (sinceId) params.since_id = sinceId;
  const res = await client.v2.userTimeline(userId, params);
  return res.tweets;
}

export async function getMyFollowings(client: TwitterApi) {
  // Requires user-context. If not available, this will throw.
  const me = await client.v2.me();
  const following = await client.v2.following(me.data.id, { max_results: 1000 });
  return following.data.map((u) => u.username);
}