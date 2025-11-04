"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Store = void 0;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const path_1 = __importDefault(require("path"));
class Store {
    constructor(dbPath = path_1.default.join(process.cwd(), "data.db")) {
        this.db = new better_sqlite3_1.default(dbPath);
        this.setup();
    }
    setup() {
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        name TEXT,
        last_seen_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS tweets (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        text TEXT NOT NULL,
        created_at TEXT,
        lang TEXT,
        entities_json TEXT,
        raw_json TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS user_latest (
        user_id TEXT PRIMARY KEY,
        last_tweet_id TEXT
      );
    `);
        // 索引优化：按用户与时间查询更高效
        this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_tweets_user_created ON tweets(user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_tweets_created ON tweets(created_at DESC);
    `);
    }
    upsertUser(user) {
        const stmt = this.db.prepare(`INSERT INTO users (id, username, name, last_seen_at)
      VALUES (@id, @username, @name, @last_seen_at)
      ON CONFLICT(id) DO UPDATE SET username=excluded.username, name=excluded.name, last_seen_at=excluded.last_seen_at`);
        stmt.run({ ...user, last_seen_at: user.last_seen_at ?? Date.now() });
    }
    saveTweets(tweets) {
        const insert = this.db.prepare(`INSERT OR IGNORE INTO tweets (id, user_id, text, created_at, lang, entities_json, raw_json)
      VALUES (@id, @user_id, @text, @created_at, @lang, @entities_json, @raw_json)`);
        const txn = this.db.transaction((items) => {
            for (const t of items)
                insert.run(t);
        });
        txn(tweets);
    }
    getLastTweetId(userId) {
        const row = this.db.prepare(`SELECT last_tweet_id FROM user_latest WHERE user_id = ?`).get(userId);
        return row?.last_tweet_id;
    }
    setLastTweetId(userId, tweetId) {
        const stmt = this.db.prepare(`INSERT INTO user_latest (user_id, last_tweet_id)
      VALUES (?, ?)
      ON CONFLICT(user_id) DO UPDATE SET last_tweet_id=excluded.last_tweet_id`);
        stmt.run(userId, tweetId);
    }
    listTweetsByUser(username, limit = 20) {
        if (username) {
            const rows = this.db.prepare(`
        SELECT t.* FROM tweets t
        JOIN users u ON t.user_id=u.id
        WHERE u.username = ?
        ORDER BY t.created_at DESC
        LIMIT ?
      `).all(username, limit);
            return rows;
        }
        else {
            const rows = this.db.prepare(`
        SELECT * FROM tweets
        ORDER BY created_at DESC
        LIMIT ?
      `).all(limit);
            return rows;
        }
    }
    // 列出当前跟踪的用户
    listUsers() {
        const rows = this.db.prepare(`
      SELECT id, username, name FROM users
      ORDER BY username ASC
    `).all();
        return rows;
    }
    // 查询推文（支持用户名、时间范围、文本包含、语言与输出条数）
    queryTweets(opts) {
        const conditions = [];
        const params = [];
        if (opts.username) {
            conditions.push("u.username = ?");
            params.push(opts.username);
        }
        if (opts.since) {
            conditions.push("t.created_at >= ?");
            params.push(opts.since);
        }
        if (opts.until) {
            conditions.push("t.created_at <= ?");
            params.push(opts.until);
        }
        if (opts.lang) {
            conditions.push("t.lang = ?");
            params.push(opts.lang);
        }
        if (opts.contains) {
            conditions.push("t.text LIKE ? COLLATE NOCASE");
            params.push(`%${opts.contains}%`);
        }
        const limit = opts.limit ?? 20;
        let sql = `
      SELECT t.*, u.username FROM tweets t
      JOIN users u ON t.user_id = u.id
    `;
        if (conditions.length) {
            sql += ` WHERE ${conditions.join(" AND ")}`;
        }
        sql += ` ORDER BY t.created_at DESC LIMIT ?`;
        params.push(limit);
        const rows = this.db.prepare(sql).all(...params);
        return rows;
    }
    // 关闭数据库（可选）
    close() {
        this.db.close();
    }
}
exports.Store = Store;
//# sourceMappingURL=store.js.map