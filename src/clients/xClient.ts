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
  const res = await client.v2.userByUsername(username, {
    "user.fields": ["profile_image_url"],
  });
  return res.data;
}

export interface TimelineTweetWithMedia {
  tweet: TweetV2;
  media: MediaObjectV2[];
  references: ExtractedTweetReference[];
}

export interface ParsedTweetLink {
  tweetId: string;
  username?: string;
  normalizedUrl: string;
}

export interface ReferenceTweetSnapshot {
  id: string;
  author_id?: string;
  username?: string;
  name?: string;
  text?: string;
  created_at?: string;
  lang?: string;
  media?: MediaObjectV2[];
  unavailable_reason?: string;
  raw_json?: string;
}

export interface ExtractedTweetReference {
  ref_tweet_id: string;
  ref_type: "quoted" | "replied_to" | "retweeted" | "link";
  source: "referenced_tweets" | "url";
  url?: string;
  snapshot?: ReferenceTweetSnapshot;
}

const parseTweetLinkFromUrlObject = (parsed: URL): ParsedTweetLink | undefined => {
  const host = parsed.hostname.toLowerCase();
  const supportedHosts = new Set(["x.com", "www.x.com", "twitter.com", "www.twitter.com"]);
  if (!supportedHosts.has(host)) return undefined;

  const segments = parsed.pathname.split("/").filter(Boolean);
  if (segments.length < 3) return undefined;

  if (segments[1] === "status" && /^\d+$/.test(segments[2])) {
    return {
      tweetId: segments[2],
      username: segments[0],
      normalizedUrl: `https://x.com/${segments[0]}/status/${segments[2]}`,
    };
  }
  if (
    segments[0] === "i" &&
    segments[1] === "web" &&
    segments[2] === "status" &&
    /^\d+$/.test(segments[3] ?? "")
  ) {
    return {
      tweetId: segments[3],
      normalizedUrl: `https://x.com/i/web/status/${segments[3]}`,
    };
  }
  return undefined;
};

export const parseTweetLink = (url: string): ParsedTweetLink | undefined => {
  if (!url || typeof url !== "string") return undefined;
  try {
    return parseTweetLinkFromUrlObject(new URL(url));
  } catch {
    try {
      return parseTweetLinkFromUrlObject(new URL(`https://${url}`));
    } catch {
      return undefined;
    }
  }
};

export async function getUserTweetsSince(
  client: TwitterApi,
  userId: string,
  sinceId?: string,
  maxResults = 20
): Promise<TimelineTweetWithMedia[]> {
  const params: Record<string, unknown> = {
    exclude: ["retweets", "replies"],
    max_results: Math.min(Math.max(maxResults, 5), 100),
    "tweet.fields": ["created_at", "lang", "entities", "author_id", "referenced_tweets"],
    "user.fields": ["username", "name"],
    expansions: ["attachments.media_keys", "referenced_tweets.id", "referenced_tweets.id.author_id"],
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
  const includes = (res as any).includes ?? {};
  const includedTweets = (includes.tweets ?? []) as TweetV2[];
  const includedUsers = (includes.users ?? []) as Array<{
    id: string;
    username?: string;
    name?: string;
  }>;
  const includedMedia = (includes.media ?? []) as MediaObjectV2[];
  const includedTweetsById = new Map(includedTweets.map((tweet) => [tweet.id, tweet]));
  const includedUsersById = new Map(includedUsers.map((user) => [user.id, user]));

  const findMediaForTweet = (tweet: TweetV2): MediaObjectV2[] => {
    try {
      return res.includes.medias(tweet);
    } catch {
      const keys = (tweet.attachments?.media_keys ?? []).filter(Boolean);
      if (!keys.length) return [];
      const keySet = new Set(keys);
      return includedMedia.filter((item) => item.media_key && keySet.has(item.media_key));
    }
  };

  return tweets.map((tweet) => {
    const refs = new Map<string, ExtractedTweetReference>();
    for (const ref of tweet.referenced_tweets ?? []) {
      if (!ref?.id || ref.id === tweet.id) continue;
      refs.set(ref.id, {
        ref_tweet_id: ref.id,
        ref_type: (ref.type as "quoted" | "replied_to" | "retweeted") ?? "quoted",
        source: "referenced_tweets",
      });
    }
    for (const entityUrl of tweet.entities?.urls ?? []) {
      if (!entityUrl?.expanded_url) continue;
      const parsed = parseTweetLink(entityUrl.expanded_url);
      if (!parsed || parsed.tweetId === tweet.id) continue;
      const existing = refs.get(parsed.tweetId);
      if (existing) {
        if (!existing.url) existing.url = parsed.normalizedUrl;
        if (!existing.snapshot && parsed.username) {
          existing.snapshot = {
            id: parsed.tweetId,
            username: parsed.username,
            unavailable_reason: "unavailable",
          };
        }
        continue;
      }
      refs.set(parsed.tweetId, {
        ref_tweet_id: parsed.tweetId,
        ref_type: "link",
        source: "url",
        url: parsed.normalizedUrl,
        snapshot: {
          id: parsed.tweetId,
          username: parsed.username,
          unavailable_reason: "unavailable",
        },
      });
    }

    const references = Array.from(refs.values()).map((ref) => {
      const included = includedTweetsById.get(ref.ref_tweet_id);
      if (!included) return ref;
      const author = included.author_id ? includedUsersById.get(included.author_id) : undefined;
      return {
        ...ref,
        snapshot: {
          id: included.id,
          author_id: included.author_id,
          username: author?.username,
          name: author?.name,
          text: included.text,
          created_at: included.created_at,
          lang: included.lang,
          media: findMediaForTweet(included),
          raw_json: JSON.stringify(included),
        },
      };
    });

    return {
      tweet,
      media: findMediaForTweet(tweet),
      references,
    };
  });
}

export async function getMyFollowings(client: TwitterApi): Promise<string[]> {
  // Requires user-context. If not available, this will throw.
  const me = await client.v2.me();
  // max_results cap is 1000 per page; paginate for users following > 1000 accounts
  const following = await client.v2.following(me.data.id, { max_results: 1000 });
  return (following.data ?? []).map((u) => u.username);
}
