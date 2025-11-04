"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createXClient = createXClient;
exports.getUserByUsername = getUserByUsername;
exports.getUserTweetsSince = getUserTweetsSince;
exports.getMyFollowings = getMyFollowings;
const twitter_api_v2_1 = require("twitter-api-v2");
const logger_1 = require("../utils/logger");
function createXClient(secrets, agent) {
    const opts = agent ? { requestOptions: { httpAgent: agent, httpsAgent: agent } } : undefined;
    // Prefer OAuth1.0a user-context if provided, else fallback to bearer token
    if (secrets.X_API_KEY && secrets.X_API_SECRET && secrets.X_ACCESS_TOKEN && secrets.X_ACCESS_SECRET) {
        logger_1.logger.info("使用 OAuth1.0a 用户上下文初始化 X 客户端");
        return new twitter_api_v2_1.TwitterApi({
            appKey: secrets.X_API_KEY,
            appSecret: secrets.X_API_SECRET,
            accessToken: secrets.X_ACCESS_TOKEN,
            accessSecret: secrets.X_ACCESS_SECRET,
        }, opts);
    }
    if (secrets.X_BEARER_TOKEN) {
        logger_1.logger.info("使用 Bearer Token 初始化 X 客户端（仅部分只读接口可用）");
        return new twitter_api_v2_1.TwitterApi({ bearerToken: secrets.X_BEARER_TOKEN }, opts);
    }
    throw new Error("未提供有效的 X 授权信息：请在 .env 中设置 OAuth1.0a 或 Bearer Token");
}
async function getUserByUsername(client, username) {
    const res = await client.v2.userByUsername(username);
    return res.data;
}
async function getUserTweetsSince(client, userId, sinceId, maxResults = 20) {
    const params = {
        exclude: ["retweets", "replies"],
        max_results: Math.min(Math.max(maxResults, 5), 100),
        "tweet.fields": ["created_at", "lang", "entities"],
    };
    if (sinceId)
        params.since_id = sinceId;
    const res = await client.v2.userTimeline(userId, params);
    return res.tweets;
}
async function getMyFollowings(client) {
    // Requires user-context. If not available, this will throw.
    const me = await client.v2.me();
    const following = await client.v2.following(me.data.id, { max_results: 1000 });
    return following.data.map((u) => u.username);
}
//# sourceMappingURL=xClient.js.map