import Database from "better-sqlite3";
import path from "path";
import { TweetEntity, UserEntity } from "./types";

export class Store {
  private db: Database.Database;
  private stmtUpsertUser!: Database.Statement;
  private stmtInsertTweet!: Database.Statement;
  private stmtGetLastTweetId!: Database.Statement;
  private stmtSetLastTweetId!: Database.Statement;

  constructor(dbPath = path.join(process.cwd(), "data.db")) {
    this.db = new Database(dbPath);
    this.setup();
    this.prepareStatements();
  }

  private setup() {
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

  private prepareStatements() {
    this.stmtUpsertUser = this.db.prepare(`
      INSERT INTO users (id, username, name, last_seen_at)
      VALUES (@id, @username, @name, @last_seen_at)
      ON CONFLICT(id) DO UPDATE SET username=excluded.username, name=excluded.name, last_seen_at=excluded.last_seen_at
    `);
    this.stmtInsertTweet = this.db.prepare(`
      INSERT OR IGNORE INTO tweets (id, user_id, text, created_at, lang, entities_json, raw_json)
      VALUES (@id, @user_id, @text, @created_at, @lang, @entities_json, @raw_json)
    `);
    this.stmtGetLastTweetId = this.db.prepare(`
      SELECT last_tweet_id FROM user_latest WHERE user_id = ?
    `);
    this.stmtSetLastTweetId = this.db.prepare(`
      INSERT INTO user_latest (user_id, last_tweet_id)
      VALUES (?, ?)
      ON CONFLICT(user_id) DO UPDATE SET last_tweet_id=excluded.last_tweet_id
    `);
  }

  upsertUser(user: UserEntity) {
    this.stmtUpsertUser.run({ ...user, last_seen_at: user.last_seen_at ?? Date.now() });
  }

  saveTweets(tweets: TweetEntity[]) {
    const txn = this.db.transaction((items: TweetEntity[]) => {
      for (const t of items) this.stmtInsertTweet.run(t);
    });
    txn(tweets);
  }

  getLastTweetId(userId: string): string | undefined {
    const row = this.stmtGetLastTweetId.get(userId) as { last_tweet_id?: string } | undefined;
    return row?.last_tweet_id;
  }

  setLastTweetId(userId: string, tweetId: string) {
    this.stmtSetLastTweetId.run(userId, tweetId);
  }

  listTweetsByUser(username?: string, limit = 20) {
    if (username) {
      return this.db.prepare(`
        SELECT t.* FROM tweets t
        JOIN users u ON t.user_id=u.id
        WHERE u.username = ?
        ORDER BY t.created_at DESC
        LIMIT ?
      `).all(username, limit) as TweetEntity[];
    }
    return this.db.prepare(`
      SELECT * FROM tweets
      ORDER BY created_at DESC
      LIMIT ?
    `).all(limit) as TweetEntity[];
  }

  listUsers() {
    return this.db.prepare(`
      SELECT id, username, name FROM users
      ORDER BY username ASC
    `).all() as { id: string; username: string; name?: string }[];
  }

  queryTweets(opts: {
    username?: string;
    since?: string;
    until?: string;
    contains?: string;
    lang?: string;
    limit?: number;
  }) {
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (opts.username) { conditions.push("u.username = ?"); params.push(opts.username); }
    if (opts.since)    { conditions.push("t.created_at >= ?"); params.push(opts.since); }
    if (opts.until)    { conditions.push("t.created_at <= ?"); params.push(opts.until); }
    if (opts.lang)     { conditions.push("t.lang = ?"); params.push(opts.lang); }
    if (opts.contains) { conditions.push("t.text LIKE ? COLLATE NOCASE"); params.push(`%${opts.contains}%`); }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const sql = `
      SELECT t.*, u.username FROM tweets t
      JOIN users u ON t.user_id = u.id
      ${where}
      ORDER BY t.created_at DESC LIMIT ?
    `;
    params.push(opts.limit ?? 20);

    return this.db.prepare(sql).all(...params) as (TweetEntity & { username: string })[];
  }

  close() {
    this.db.close();
  }
}
