import Database from "better-sqlite3";
import path from "path";
import { TweetEntity, UserEntity } from "./types";

export interface MediaAssetUpsert {
  source_hash: string;
  source_url: string;
  media_type?: string;
  media_key?: string;
  file_ext?: string;
  mime_type?: string;
  relative_path: string;
  file_size: number;
  last_accessed_at: number;
  last_cached_at?: number;
  cache_error?: string | null;
}

export interface MediaAssetRecord {
  source_hash: string;
  source_url: string;
  media_type?: string;
  media_key?: string;
  file_ext?: string;
  mime_type?: string;
  relative_path: string;
  file_size: number;
  created_at: number;
  updated_at: number;
  last_accessed_at: number;
  last_cached_at?: number;
  cache_error?: string | null;
}

export interface TweetMediaLinkInput {
  source_hash: string;
  media_key?: string;
  sort_order: number;
}

export type TaskRunStatus = "idle" | "running" | "success" | "failed";
export type TaskAcquireReason = "running" | "retry_wait";

export interface TaskRunRecord {
  task_key: string;
  status: TaskRunStatus;
  payload_json?: string | null;
  progress_json?: string | null;
  result_json?: string | null;
  last_error?: string | null;
  attempt: number;
  next_retry_at?: number | null;
  heartbeat_at?: number | null;
  started_at?: number | null;
  finished_at?: number | null;
  updated_at: number;
}

export interface AcquireTaskRunInput {
  payload_json?: string | null;
  progress_json?: string | null;
  now?: number;
  staleAfterMs?: number;
  resetProgress?: boolean;
  ignoreRetryWindow?: boolean;
}

export interface AcquireTaskRunResult {
  acquired: boolean;
  reason?: TaskAcquireReason;
  task: TaskRunRecord;
}

export class Store {
  private db: Database.Database;
  private stmtUpsertUser!: Database.Statement;
  private stmtInsertTweet!: Database.Statement;
  private stmtGetLastTweetId!: Database.Statement;
  private stmtSetLastTweetId!: Database.Statement;
  private stmtUpdateTweetMediaJson!: Database.Statement;
  private stmtUpsertMediaAsset!: Database.Statement;
  private stmtDeleteTweetMediaByTweetId!: Database.Statement;
  private stmtInsertTweetMediaLink!: Database.Statement;
  private stmtDeleteMediaAssetsBySourceHash!: Database.Statement;
  private stmtTouchMediaAssetByRelativePath!: Database.Statement;
  private stmtUpsertUserRateLimit!: Database.Statement;
  private stmtGetUserRateLimit!: Database.Statement;
  private stmtClearUserRateLimit!: Database.Statement;
  private stmtDeleteExpiredUserRateLimits!: Database.Statement;
  private stmtEnsureTaskRun!: Database.Statement;
  private stmtGetTaskRunByKey!: Database.Statement;
  private stmtUpdateTaskRunAcquire!: Database.Statement;
  private stmtTouchTaskRun!: Database.Statement;
  private stmtFinishTaskRunSuccess!: Database.Statement;
  private stmtFinishTaskRunFailed!: Database.Statement;

  constructor(dbPath = path.join(process.cwd(), "data.db")) {
    this.db = new Database(dbPath);
    this.db.pragma("foreign_keys = ON");
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
        media_json TEXT,
        entities_json TEXT,
        raw_json TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS user_latest (
        user_id TEXT PRIMARY KEY,
        last_tweet_id TEXT
      );

      CREATE TABLE IF NOT EXISTS media_assets (
        source_hash TEXT PRIMARY KEY,
        source_url TEXT NOT NULL UNIQUE,
        media_type TEXT,
        media_key TEXT,
        file_ext TEXT,
        mime_type TEXT,
        relative_path TEXT NOT NULL UNIQUE,
        file_size INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        last_accessed_at INTEGER NOT NULL,
        last_cached_at INTEGER,
        cache_error TEXT
      );

      CREATE TABLE IF NOT EXISTS tweet_media (
        tweet_id TEXT NOT NULL,
        source_hash TEXT NOT NULL,
        media_key TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (tweet_id, source_hash),
        FOREIGN KEY (tweet_id) REFERENCES tweets(id) ON DELETE CASCADE,
        FOREIGN KEY (source_hash) REFERENCES media_assets(source_hash) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS user_rate_limits (
        username_key TEXT PRIMARY KEY,
        blocked_until INTEGER NOT NULL,
        last_error TEXT,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS task_runs (
        task_key TEXT PRIMARY KEY,
        status TEXT NOT NULL DEFAULT 'idle',
        payload_json TEXT,
        progress_json TEXT,
        result_json TEXT,
        last_error TEXT,
        attempt INTEGER NOT NULL DEFAULT 0,
        next_retry_at INTEGER,
        heartbeat_at INTEGER,
        started_at INTEGER,
        finished_at INTEGER,
        updated_at INTEGER NOT NULL
      );
    `);
    // 索引优化：按用户与时间查询更高效
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_tweets_user_created ON tweets(user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_tweets_created ON tweets(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_tweet_media_source_hash ON tweet_media(source_hash);
      CREATE INDEX IF NOT EXISTS idx_media_assets_last_accessed ON media_assets(last_accessed_at ASC);
      CREATE INDEX IF NOT EXISTS idx_user_rate_limits_blocked_until ON user_rate_limits(blocked_until);
      CREATE INDEX IF NOT EXISTS idx_task_runs_status_next_retry ON task_runs(status, next_retry_at);
    `);

    // 兼容旧库结构：历史库可能没有 media_json 列
    const tweetCols = this.db
      .prepare("PRAGMA table_info(tweets)")
      .all() as { name: string }[];
    const hasMediaJson = tweetCols.some((col) => col.name === "media_json");
    if (!hasMediaJson) {
      this.db.exec("ALTER TABLE tweets ADD COLUMN media_json TEXT");
    }
  }

  private prepareStatements() {
    this.stmtUpsertUser = this.db.prepare(`
      INSERT INTO users (id, username, name, last_seen_at)
      VALUES (@id, @username, @name, @last_seen_at)
      ON CONFLICT(id) DO UPDATE SET username=excluded.username, name=excluded.name, last_seen_at=excluded.last_seen_at
    `);
    this.stmtInsertTweet = this.db.prepare(`
      INSERT INTO tweets (id, user_id, text, created_at, lang, media_json, entities_json, raw_json)
      VALUES (@id, @user_id, @text, @created_at, @lang, @media_json, @entities_json, @raw_json)
      ON CONFLICT(id) DO UPDATE SET
        user_id = excluded.user_id,
        text = excluded.text,
        created_at = COALESCE(excluded.created_at, tweets.created_at),
        lang = COALESCE(excluded.lang, tweets.lang),
        media_json = COALESCE(excluded.media_json, tweets.media_json),
        entities_json = COALESCE(excluded.entities_json, tweets.entities_json),
        raw_json = COALESCE(excluded.raw_json, tweets.raw_json)
    `);
    this.stmtGetLastTweetId = this.db.prepare(`
      SELECT last_tweet_id FROM user_latest WHERE user_id = ?
    `);
    this.stmtSetLastTweetId = this.db.prepare(`
      INSERT INTO user_latest (user_id, last_tweet_id)
      VALUES (?, ?)
      ON CONFLICT(user_id) DO UPDATE SET last_tweet_id=excluded.last_tweet_id
    `);
    this.stmtUpdateTweetMediaJson = this.db.prepare(`
      UPDATE tweets SET media_json = ? WHERE id = ?
    `);
    this.stmtUpsertMediaAsset = this.db.prepare(`
      INSERT INTO media_assets (
        source_hash,
        source_url,
        media_type,
        media_key,
        file_ext,
        mime_type,
        relative_path,
        file_size,
        created_at,
        updated_at,
        last_accessed_at,
        last_cached_at,
        cache_error
      )
      VALUES (
        @source_hash,
        @source_url,
        @media_type,
        @media_key,
        @file_ext,
        @mime_type,
        @relative_path,
        @file_size,
        @created_at,
        @updated_at,
        @last_accessed_at,
        @last_cached_at,
        @cache_error
      )
      ON CONFLICT(source_hash) DO UPDATE SET
        source_url = excluded.source_url,
        media_type = excluded.media_type,
        media_key = excluded.media_key,
        file_ext = excluded.file_ext,
        mime_type = excluded.mime_type,
        relative_path = excluded.relative_path,
        file_size = excluded.file_size,
        updated_at = excluded.updated_at,
        last_accessed_at = excluded.last_accessed_at,
        last_cached_at = excluded.last_cached_at,
        cache_error = excluded.cache_error
    `);
    this.stmtDeleteTweetMediaByTweetId = this.db.prepare(`
      DELETE FROM tweet_media WHERE tweet_id = ?
    `);
    this.stmtInsertTweetMediaLink = this.db.prepare(`
      INSERT INTO tweet_media (tweet_id, source_hash, media_key, sort_order, created_at, updated_at)
      VALUES (@tweet_id, @source_hash, @media_key, @sort_order, @created_at, @updated_at)
      ON CONFLICT(tweet_id, source_hash) DO UPDATE SET
        media_key = excluded.media_key,
        sort_order = excluded.sort_order,
        updated_at = excluded.updated_at
    `);
    this.stmtDeleteMediaAssetsBySourceHash = this.db.prepare(`
      DELETE FROM media_assets WHERE source_hash = ?
    `);
    this.stmtTouchMediaAssetByRelativePath = this.db.prepare(`
      UPDATE media_assets
      SET last_accessed_at = ?, updated_at = ?
      WHERE relative_path = ?
    `);
    this.stmtUpsertUserRateLimit = this.db.prepare(`
      INSERT INTO user_rate_limits (username_key, blocked_until, last_error, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(username_key) DO UPDATE SET
        blocked_until = excluded.blocked_until,
        last_error = excluded.last_error,
        updated_at = excluded.updated_at
    `);
    this.stmtGetUserRateLimit = this.db.prepare(`
      SELECT username_key, blocked_until, last_error, updated_at
      FROM user_rate_limits
      WHERE username_key = ?
    `);
    this.stmtClearUserRateLimit = this.db.prepare(`
      DELETE FROM user_rate_limits WHERE username_key = ?
    `);
    this.stmtDeleteExpiredUserRateLimits = this.db.prepare(`
      DELETE FROM user_rate_limits WHERE blocked_until <= ?
    `);
    this.stmtEnsureTaskRun = this.db.prepare(`
      INSERT INTO task_runs (task_key, status, attempt, updated_at)
      VALUES (?, 'idle', 0, ?)
      ON CONFLICT(task_key) DO NOTHING
    `);
    this.stmtGetTaskRunByKey = this.db.prepare(`
      SELECT
        task_key,
        status,
        payload_json,
        progress_json,
        result_json,
        last_error,
        attempt,
        next_retry_at,
        heartbeat_at,
        started_at,
        finished_at,
        updated_at
      FROM task_runs
      WHERE task_key = ?
    `);
    this.stmtUpdateTaskRunAcquire = this.db.prepare(`
      UPDATE task_runs
      SET status = 'running',
          payload_json = ?,
          progress_json = ?,
          attempt = ?,
          next_retry_at = NULL,
          last_error = NULL,
          heartbeat_at = ?,
          started_at = ?,
          finished_at = NULL,
          updated_at = ?
      WHERE task_key = ?
    `);
    this.stmtTouchTaskRun = this.db.prepare(`
      UPDATE task_runs
      SET heartbeat_at = ?,
          updated_at = ?,
          progress_json = CASE WHEN ? IS NULL THEN progress_json ELSE ? END
      WHERE task_key = ?
    `);
    this.stmtFinishTaskRunSuccess = this.db.prepare(`
      UPDATE task_runs
      SET status = 'success',
          result_json = ?,
          progress_json = CASE WHEN ? IS NULL THEN progress_json ELSE ? END,
          next_retry_at = NULL,
          last_error = NULL,
          heartbeat_at = ?,
          finished_at = ?,
          updated_at = ?
      WHERE task_key = ?
    `);
    this.stmtFinishTaskRunFailed = this.db.prepare(`
      UPDATE task_runs
      SET status = 'failed',
          last_error = ?,
          next_retry_at = ?,
          progress_json = CASE WHEN ? IS NULL THEN progress_json ELSE ? END,
          heartbeat_at = ?,
          finished_at = ?,
          updated_at = ?
      WHERE task_key = ?
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

  updateTweetMediaJson(tweetId: string, mediaJson: string | null) {
    this.stmtUpdateTweetMediaJson.run(mediaJson, tweetId);
  }

  upsertMediaAssets(assets: MediaAssetUpsert[]) {
    if (!assets.length) return;
    const now = Date.now();
    const txn = this.db.transaction((items: MediaAssetUpsert[]) => {
      for (const item of items) {
        this.stmtUpsertMediaAsset.run({
          ...item,
          created_at: now,
          updated_at: now,
          cache_error: item.cache_error ?? null,
          last_cached_at: item.last_cached_at ?? null,
        });
      }
    });
    txn(assets);
  }

  replaceTweetMediaLinks(tweetId: string, links: TweetMediaLinkInput[]) {
    const txn = this.db.transaction((targetTweetId: string, targetLinks: TweetMediaLinkInput[]) => {
      this.stmtDeleteTweetMediaByTweetId.run(targetTweetId);
      if (!targetLinks.length) return;
      const now = Date.now();
      for (const link of targetLinks) {
        this.stmtInsertTweetMediaLink.run({
          tweet_id: targetTweetId,
          source_hash: link.source_hash,
          media_key: link.media_key ?? null,
          sort_order: link.sort_order,
          created_at: now,
          updated_at: now,
        });
      }
    });
    txn(tweetId, links);
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
        WHERE u.username = ? COLLATE NOCASE
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
    offset?: number;
  }) {
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (opts.username) { conditions.push("u.username = ? COLLATE NOCASE"); params.push(opts.username); }
    if (opts.since)    { conditions.push("t.created_at >= ?"); params.push(opts.since); }
    if (opts.until)    { conditions.push("t.created_at <= ?"); params.push(opts.until); }
    if (opts.lang)     { conditions.push("t.lang = ?"); params.push(opts.lang); }
    if (opts.contains) { conditions.push("t.text LIKE ? COLLATE NOCASE"); params.push(`%${opts.contains}%`); }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const sql = `
      SELECT t.*, u.username, u.name as user_name FROM tweets t
      JOIN users u ON t.user_id = u.id
      ${where}
      ORDER BY t.created_at DESC LIMIT ? OFFSET ?
    `;
    params.push(opts.limit ?? 20, opts.offset ?? 0);

    return this.db.prepare(sql).all(...params) as (TweetEntity & { username: string; user_name?: string })[];
  }

  listTweetsWithMedia(opts: { usernames?: string[]; limit?: number; offset?: number } = {}) {
    const conditions: string[] = ["t.media_json IS NOT NULL", "t.media_json != ''"];
    const params: (string | number)[] = [];

    if (opts.usernames?.length) {
      const placeholders = opts.usernames.map(() => "?").join(",");
      conditions.push(`LOWER(u.username) IN (${placeholders})`);
      params.push(...opts.usernames.map((u) => u.toLowerCase()));
    }

    const where = `WHERE ${conditions.join(" AND ")}`;
    const sql = `
      SELECT t.id, t.media_json, u.username
      FROM tweets t
      JOIN users u ON u.id = t.user_id
      ${where}
      ORDER BY t.created_at DESC
      LIMIT ? OFFSET ?
    `;
    params.push(opts.limit ?? 100, opts.offset ?? 0);

    return this.db.prepare(sql).all(...params) as {
      id: string;
      media_json?: string;
      username: string;
    }[];
  }

  listMediaAssets() {
    return this.db.prepare(`
      SELECT
        source_hash,
        source_url,
        media_type,
        media_key,
        file_ext,
        mime_type,
        relative_path,
        file_size,
        created_at,
        updated_at,
        last_accessed_at,
        last_cached_at,
        cache_error
      FROM media_assets
    `).all() as MediaAssetRecord[];
  }

  listTweetMediaLinksBySourceHashes(sourceHashes: string[]) {
    if (!sourceHashes.length) return [] as {
      tweet_id: string;
      source_hash: string;
      media_key?: string;
    }[];
    const placeholders = sourceHashes.map(() => "?").join(",");
    return this.db.prepare(`
      SELECT tweet_id, source_hash, media_key
      FROM tweet_media
      WHERE source_hash IN (${placeholders})
    `).all(...sourceHashes) as {
      tweet_id: string;
      source_hash: string;
      media_key?: string;
    }[];
  }

  getTweetMediaRowsByIds(tweetIds: string[]) {
    if (!tweetIds.length) return [] as { id: string; media_json?: string }[];
    const placeholders = tweetIds.map(() => "?").join(",");
    return this.db.prepare(`
      SELECT id, media_json
      FROM tweets
      WHERE id IN (${placeholders})
    `).all(...tweetIds) as { id: string; media_json?: string }[];
  }

  deleteMediaAssetsBySourceHashes(sourceHashes: string[]) {
    if (!sourceHashes.length) return;
    const txn = this.db.transaction((items: string[]) => {
      for (const hash of items) {
        this.stmtDeleteMediaAssetsBySourceHash.run(hash);
      }
    });
    txn(sourceHashes);
  }

  touchMediaAssetByRelativePath(relativePath: string, at = Date.now()) {
    this.stmtTouchMediaAssetByRelativePath.run(at, at, relativePath);
  }

  getUserRateLimit(usernameKey: string, now = Date.now()): number | undefined {
    const row = this.stmtGetUserRateLimit.get(usernameKey) as
      | { blocked_until: number }
      | undefined;
    if (!row) return undefined;
    if (!Number.isFinite(row.blocked_until) || row.blocked_until <= now) {
      this.clearUserRateLimit(usernameKey);
      return undefined;
    }
    return row.blocked_until;
  }

  setUserRateLimit(usernameKey: string, blockedUntil: number, lastError?: string) {
    const now = Date.now();
    this.stmtUpsertUserRateLimit.run(usernameKey, blockedUntil, lastError ?? null, now);
  }

  clearUserRateLimit(usernameKey: string) {
    this.stmtClearUserRateLimit.run(usernameKey);
  }

  cleanupExpiredUserRateLimits(now = Date.now()) {
    return this.stmtDeleteExpiredUserRateLimits.run(now).changes;
  }

  getTaskRun(taskKey: string): TaskRunRecord | undefined {
    return this.stmtGetTaskRunByKey.get(taskKey) as TaskRunRecord | undefined;
  }

  listTaskRuns(taskKeys: string[]) {
    if (!taskKeys.length) return [] as TaskRunRecord[];
    const placeholders = taskKeys.map(() => "?").join(",");
    return this.db.prepare(`
      SELECT
        task_key,
        status,
        payload_json,
        progress_json,
        result_json,
        last_error,
        attempt,
        next_retry_at,
        heartbeat_at,
        started_at,
        finished_at,
        updated_at
      FROM task_runs
      WHERE task_key IN (${placeholders})
    `).all(...taskKeys) as TaskRunRecord[];
  }

  acquireTaskRun(taskKey: string, input: AcquireTaskRunInput = {}): AcquireTaskRunResult {
    const now = input.now ?? Date.now();
    const staleAfterMs = input.staleAfterMs ?? 10 * 60 * 1000;
    const txn = this.db.transaction(() => {
      this.stmtEnsureTaskRun.run(taskKey, now);
      const current = this.stmtGetTaskRunByKey.get(taskKey) as TaskRunRecord;
      const isRunningFresh =
        current.status === "running" &&
        Number.isFinite(current.heartbeat_at) &&
        (current.heartbeat_at as number) >= now - staleAfterMs;

      if (isRunningFresh) {
        return { acquired: false, reason: "running" as TaskAcquireReason, task: current };
      }
      if (
        !input.ignoreRetryWindow &&
        Number.isFinite(current.next_retry_at) &&
        (current.next_retry_at as number) > now
      ) {
        return { acquired: false, reason: "retry_wait" as TaskAcquireReason, task: current };
      }

      const payloadJson =
        input.payload_json !== undefined
          ? input.payload_json
          : (current.payload_json ?? null);
      const progressJson =
        input.progress_json !== undefined
          ? input.progress_json
          : input.resetProgress
          ? null
          : (current.progress_json ?? null);
      const nextAttempt = Math.max(0, current.attempt ?? 0) + 1;

      this.stmtUpdateTaskRunAcquire.run(
        payloadJson,
        progressJson,
        nextAttempt,
        now,
        now,
        now,
        taskKey
      );
      const next = this.stmtGetTaskRunByKey.get(taskKey) as TaskRunRecord;
      return { acquired: true, task: next };
    });
    return txn();
  }

  touchTaskRun(taskKey: string, progressJson?: string | null, now = Date.now()) {
    this.stmtTouchTaskRun.run(now, now, progressJson ?? null, progressJson ?? null, taskKey);
  }

  succeedTaskRun(taskKey: string, params: { resultJson?: string | null; progressJson?: string | null } = {}) {
    const now = Date.now();
    this.stmtFinishTaskRunSuccess.run(
      params.resultJson ?? null,
      params.progressJson ?? null,
      params.progressJson ?? null,
      now,
      now,
      now,
      taskKey
    );
  }

  failTaskRun(
    taskKey: string,
    params: { error: string; nextRetryAt?: number | null; progressJson?: string | null }
  ) {
    const now = Date.now();
    this.stmtFinishTaskRunFailed.run(
      params.error,
      params.nextRetryAt ?? null,
      params.progressJson ?? null,
      params.progressJson ?? null,
      now,
      now,
      now,
      taskKey
    );
  }

  countTweets(opts: {
    username?: string;
    since?: string;
    until?: string;
    contains?: string;
    lang?: string;
  }) {
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (opts.username) { conditions.push("u.username = ? COLLATE NOCASE"); params.push(opts.username); }
    if (opts.since)    { conditions.push("t.created_at >= ?"); params.push(opts.since); }
    if (opts.until)    { conditions.push("t.created_at <= ?"); params.push(opts.until); }
    if (opts.lang)     { conditions.push("t.lang = ?"); params.push(opts.lang); }
    if (opts.contains) { conditions.push("t.text LIKE ? COLLATE NOCASE"); params.push(`%${opts.contains}%`); }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const sql = `SELECT COUNT(*) as count FROM tweets t JOIN users u ON t.user_id = u.id ${where}`;
    const row = this.db.prepare(sql).get(...params) as { count: number };
    return row.count;
  }

  getTotalTweetCount(): number {
    const row = this.db.prepare("SELECT COUNT(*) as count FROM tweets").get() as { count: number };
    return row.count;
  }

  getTodayTweetCount(): number {
    const today = new Date().toISOString().split("T")[0];
    const row = this.db.prepare(
      "SELECT COUNT(*) as count FROM tweets WHERE created_at >= ?"
    ).get(`${today}T00:00:00.000Z`) as { count: number };
    return row.count;
  }

  getDailyTweetCounts(days = 30): { date: string; count: number }[] {
    return this.db.prepare(`
      SELECT strftime('%Y-%m-%d', created_at) as date, COUNT(*) as count
      FROM tweets
      WHERE created_at >= datetime('now', '-${days} days')
      GROUP BY date
      ORDER BY date ASC
    `).all() as { date: string; count: number }[];
  }

  getUserTweetCounts(): { id: string; username: string; name?: string; last_seen_at?: number; count: number }[] {
    return this.db.prepare(`
      SELECT u.id, u.username, u.name, u.last_seen_at, COUNT(t.id) as count
      FROM users u
      LEFT JOIN tweets t ON u.id = t.user_id
      GROUP BY u.id
      ORDER BY count DESC
    `).all() as { id: string; username: string; name?: string; last_seen_at?: number; count: number }[];
  }

  close() {
    this.db.close();
  }
}
