import { TwitterApi } from "twitter-api-v2";
import { logger } from "../utils/logger";
import { Store } from "../data/store";
import { TweetEntity, UserEntity } from "../data/types";
import { getUserByUsername, getUserTweetsSince } from "../clients/xClient";

export async function fetchForUsernames(
  client: TwitterApi,
  store: Store,
  usernames: string[],
  maxPerUser: number,
  concurrency = 3
) {
  const fetchOne = async (username: string) => {
    try {
      const user = await getUserByUsername(client, username);
      const userEntity: UserEntity = { id: user.id, username: user.username, name: user.name, last_seen_at: Date.now() };
      store.upsertUser(userEntity);

      const sinceId = store.getLastTweetId(user.id);
      const tweets = await getUserTweetsSince(client, user.id, sinceId, maxPerUser);
      if (!tweets || tweets.length === 0) {
        logger.info({ username }, "无增量推文");
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

      // 更新最新 tweet id（时间通常已按降序返回）
      const latestId = entities[0]?.id;
      if (latestId) store.setLastTweetId(user.id, latestId);

      logger.info({ username, count: entities.length }, "拉取并保存推文完毕");
    } catch (err: any) {
      const msg = err?.data?.detail || err?.message || String(err);
      logger.error({ username, error: msg }, "拉取用户推文失败");
    }
  };

  for (let i = 0; i < usernames.length; i += concurrency) {
    const chunk = usernames.slice(i, i + concurrency);
    await Promise.allSettled(chunk.map((u) => fetchOne(u)));
  }
}