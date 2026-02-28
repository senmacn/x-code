import Database from "better-sqlite3";
import path from "path";
import {
  MonitorStatus,
  TweetEntity,
  UserEntity,
} from "./types";

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

export interface RefTweetUpsert {
  id: string;
  author_id?: string;
  author_username?: string;
  author_name?: string;
  text?: string;
  created_at?: string;
  lang?: string;
  media_json?: string;
  raw_json?: string;
  unavailable_reason?: string | null;
}

export interface TweetRefInput {
  ref_tweet_id: string;
  ref_type: string;
  source: "referenced_tweets" | "url";
  url?: string;
}

export interface TweetRefJoined {
  tweet_id: string;
  ref_tweet_id: string;
  ref_type: string;
  source: "referenced_tweets" | "url";
  url?: string;
  author_id?: string;
  author_username?: string;
  author_name?: string;
  text?: string;
  created_at?: string;
  lang?: string;
  media_json?: string;
  raw_json?: string;
  unavailable_reason?: string;
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
  private stmtGetUserByUsername!: Database.Statement;
  private stmtSetUserMonitorStatusById!: Database.Statement;
  private stmtHasOpenMonitoringPeriodByUserId!: Database.Statement;
  private stmtInsertMonitoringPeriod!: Database.Statement;
  private stmtCloseMonitoringPeriodsByUserId!: Database.Statement;
  private stmtInsertTweet!: Database.Statement;
  private stmtGetLastTweetId!: Database.Statement;
  private stmtSetLastTweetId!: Database.Statement;
  private stmtUpdateTweetMediaJson!: Database.Statement;
  private stmtUpsertMediaAsset!: Database.Statement;
  private stmtDeleteTweetMediaByTweetId!: Database.Statement;
  private stmtInsertTweetMediaLink!: Database.Statement;
  private stmtDeleteMediaAssetsBySourceHash!: Database.Statement;
  private stmtTouchMediaAssetByRelativePath!: Database.Statement;
  private stmtUpsertRefTweet!: Database.Statement;
  private stmtDeleteTweetRefsByTweetId!: Database.Statement;
  private stmtInsertTweetRef!: Database.Statement;
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
        avatar_url TEXT,
        last_seen_at INTEGER,
        monitor_status TEXT NOT NULL DEFAULT 'active',
        monitoring_started_at INTEGER,
        monitoring_ended_at INTEGER
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
        ingest_source TEXT NOT NULL DEFAULT 'direct',
        captured_at INTEGER,
        monitor_status_at_capture TEXT NOT NULL DEFAULT 'unknown',
        FOREIGN KEY (user_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS user_monitor_periods (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        source TEXT,
        reason TEXT,
        started_at INTEGER NOT NULL,
        ended_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
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

      CREATE TABLE IF NOT EXISTS ref_tweets (
        id TEXT PRIMARY KEY,
        author_id TEXT,
        author_username TEXT,
        author_name TEXT,
        text TEXT,
        created_at TEXT,
        lang TEXT,
        media_json TEXT,
        raw_json TEXT,
        unavailable_reason TEXT,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS tweet_refs (
        tweet_id TEXT NOT NULL,
        ref_tweet_id TEXT NOT NULL,
        ref_type TEXT NOT NULL,
        source TEXT NOT NULL,
        url TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (tweet_id, ref_tweet_id, source),
        FOREIGN KEY (tweet_id) REFERENCES tweets(id) ON DELETE CASCADE
      );
    `);
    // 兼容旧库结构：历史库可能缺少部分列
    const userCols = this.db
      .prepare("PRAGMA table_info(users)")
      .all() as { name: string }[];
    const hasAvatarUrl = userCols.some((col) => col.name === "avatar_url");
    if (!hasAvatarUrl) {
      this.db.exec("ALTER TABLE users ADD COLUMN avatar_url TEXT");
    }
    const hasMonitorStatus = userCols.some((col) => col.name === "monitor_status");
    if (!hasMonitorStatus) {
      this.db.exec("ALTER TABLE users ADD COLUMN monitor_status TEXT NOT NULL DEFAULT 'active'");
    }
    const hasMonitoringStartedAt = userCols.some((col) => col.name === "monitoring_started_at");
    if (!hasMonitoringStartedAt) {
      this.db.exec("ALTER TABLE users ADD COLUMN monitoring_started_at INTEGER");
    }
    const hasMonitoringEndedAt = userCols.some((col) => col.name === "monitoring_ended_at");
    if (!hasMonitoringEndedAt) {
      this.db.exec("ALTER TABLE users ADD COLUMN monitoring_ended_at INTEGER");
    }

    const tweetCols = this.db
      .prepare("PRAGMA table_info(tweets)")
      .all() as { name: string }[];
    const hasMediaJson = tweetCols.some((col) => col.name === "media_json");
    if (!hasMediaJson) {
      this.db.exec("ALTER TABLE tweets ADD COLUMN media_json TEXT");
    }
    const hasIngestSource = tweetCols.some((col) => col.name === "ingest_source");
    if (!hasIngestSource) {
      this.db.exec("ALTER TABLE tweets ADD COLUMN ingest_source TEXT NOT NULL DEFAULT 'direct'");
    }
    const hasCapturedAt = tweetCols.some((col) => col.name === "captured_at");
    if (!hasCapturedAt) {
      this.db.exec("ALTER TABLE tweets ADD COLUMN captured_at INTEGER");
    }
    const hasMonitorCaptureStatus = tweetCols.some((col) => col.name === "monitor_status_at_capture");
    if (!hasMonitorCaptureStatus) {
      this.db.exec(
        "ALTER TABLE tweets ADD COLUMN monitor_status_at_capture TEXT NOT NULL DEFAULT 'unknown'"
      );
    }

    this.db.exec(`
      UPDATE users
      SET monitor_status = COALESCE(NULLIF(monitor_status, ''), 'active')
      WHERE monitor_status IS NULL OR monitor_status = '';
      UPDATE tweets
      SET ingest_source = COALESCE(NULLIF(ingest_source, ''), 'direct')
      WHERE ingest_source IS NULL OR ingest_source = '';
      UPDATE tweets
      SET monitor_status_at_capture = COALESCE(NULLIF(monitor_status_at_capture, ''), 'unknown')
      WHERE monitor_status_at_capture IS NULL OR monitor_status_at_capture = '';
      UPDATE tweets
      SET captured_at = COALESCE(captured_at, CAST(strftime('%s', created_at) AS INTEGER) * 1000)
      WHERE captured_at IS NULL AND created_at IS NOT NULL;
    `);

    // 索引优化：按用户与时间查询更高效（放在补列迁移之后，兼容老库）
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_tweets_user_created ON tweets(user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_tweets_created ON tweets(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_tweets_monitor_capture ON tweets(monitor_status_at_capture, captured_at DESC);
      CREATE INDEX IF NOT EXISTS idx_tweet_media_source_hash ON tweet_media(source_hash);
      CREATE INDEX IF NOT EXISTS idx_media_assets_last_accessed ON media_assets(last_accessed_at ASC);
      CREATE INDEX IF NOT EXISTS idx_user_rate_limits_blocked_until ON user_rate_limits(blocked_until);
      CREATE INDEX IF NOT EXISTS idx_task_runs_status_next_retry ON task_runs(status, next_retry_at);
      CREATE INDEX IF NOT EXISTS idx_tweet_refs_tweet_id ON tweet_refs(tweet_id);
      CREATE INDEX IF NOT EXISTS idx_tweet_refs_ref_tweet_id ON tweet_refs(ref_tweet_id);
      CREATE INDEX IF NOT EXISTS idx_users_monitor_status ON users(monitor_status);
      CREATE INDEX IF NOT EXISTS idx_user_monitor_periods_user_started ON user_monitor_periods(user_id, started_at DESC);
      CREATE INDEX IF NOT EXISTS idx_user_monitor_periods_user_open ON user_monitor_periods(user_id, ended_at);
    `);
  }

  private prepareStatements() {
    this.stmtUpsertUser = this.db.prepare(`
      INSERT INTO users (
        id,
        username,
        name,
        avatar_url,
        last_seen_at,
        monitor_status,
        monitoring_started_at,
        monitoring_ended_at
      )
      VALUES (
        @id,
        @username,
        @name,
        @avatar_url,
        @last_seen_at,
        COALESCE(@monitor_status, 'active'),
        @monitoring_started_at,
        @monitoring_ended_at
      )
      ON CONFLICT(id) DO UPDATE SET
        username = excluded.username,
        name = excluded.name,
        avatar_url = COALESCE(excluded.avatar_url, users.avatar_url),
        last_seen_at = excluded.last_seen_at,
        monitor_status = COALESCE(excluded.monitor_status, users.monitor_status, 'active'),
        monitoring_started_at = COALESCE(excluded.monitoring_started_at, users.monitoring_started_at),
        monitoring_ended_at = CASE
          WHEN COALESCE(excluded.monitor_status, users.monitor_status, 'active') = 'active' THEN NULL
          ELSE COALESCE(excluded.monitoring_ended_at, users.monitoring_ended_at)
        END
    `);
    this.stmtGetUserByUsername = this.db.prepare(`
      SELECT id, username, monitor_status
      FROM users
      WHERE username = ? COLLATE NOCASE
      LIMIT 1
    `);
    this.stmtSetUserMonitorStatusById = this.db.prepare(`
      UPDATE users
      SET
        monitor_status = ?,
        monitoring_started_at = CASE
          WHEN ? = 'active' THEN COALESCE(monitoring_started_at, ?)
          ELSE monitoring_started_at
        END,
        monitoring_ended_at = CASE
          WHEN ? = 'active' THEN NULL
          WHEN ? = 'blocked_or_not_found' THEN monitoring_ended_at
          ELSE ?
        END
      WHERE id = ?
    `);
    this.stmtHasOpenMonitoringPeriodByUserId = this.db.prepare(`
      SELECT id
      FROM user_monitor_periods
      WHERE user_id = ? AND ended_at IS NULL
      LIMIT 1
    `);
    this.stmtInsertMonitoringPeriod = this.db.prepare(`
      INSERT INTO user_monitor_periods (
        user_id,
        source,
        reason,
        started_at,
        ended_at,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, NULL, ?, ?)
    `);
    this.stmtCloseMonitoringPeriodsByUserId = this.db.prepare(`
      UPDATE user_monitor_periods
      SET ended_at = ?, updated_at = ?
      WHERE user_id = ? AND ended_at IS NULL
    `);
    this.stmtInsertTweet = this.db.prepare(`
      INSERT INTO tweets (
        id,
        user_id,
        text,
        created_at,
        lang,
        media_json,
        entities_json,
        raw_json,
        ingest_source,
        captured_at,
        monitor_status_at_capture
      )
      VALUES (
        @id,
        @user_id,
        @text,
        @created_at,
        @lang,
        @media_json,
        @entities_json,
        @raw_json,
        COALESCE(@ingest_source, 'direct'),
        @captured_at,
        COALESCE(@monitor_status_at_capture, 'unknown')
      )
      ON CONFLICT(id) DO UPDATE SET
        user_id = excluded.user_id,
        text = excluded.text,
        created_at = COALESCE(excluded.created_at, tweets.created_at),
        lang = COALESCE(excluded.lang, tweets.lang),
        media_json = COALESCE(excluded.media_json, tweets.media_json),
        entities_json = COALESCE(excluded.entities_json, tweets.entities_json),
        raw_json = COALESCE(excluded.raw_json, tweets.raw_json),
        ingest_source = COALESCE(excluded.ingest_source, tweets.ingest_source, 'direct'),
        captured_at = COALESCE(excluded.captured_at, tweets.captured_at),
        monitor_status_at_capture = COALESCE(
          excluded.monitor_status_at_capture,
          tweets.monitor_status_at_capture,
          'unknown'
        )
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
    this.stmtUpsertRefTweet = this.db.prepare(`
      INSERT INTO ref_tweets (
        id,
        author_id,
        author_username,
        author_name,
        text,
        created_at,
        lang,
        media_json,
        raw_json,
        unavailable_reason,
        updated_at
      )
      VALUES (
        @id,
        @author_id,
        @author_username,
        @author_name,
        @text,
        @created_at,
        @lang,
        @media_json,
        @raw_json,
        @unavailable_reason,
        @updated_at
      )
      ON CONFLICT(id) DO UPDATE SET
        author_id = COALESCE(excluded.author_id, ref_tweets.author_id),
        author_username = COALESCE(excluded.author_username, ref_tweets.author_username),
        author_name = COALESCE(excluded.author_name, ref_tweets.author_name),
        text = COALESCE(excluded.text, ref_tweets.text),
        created_at = COALESCE(excluded.created_at, ref_tweets.created_at),
        lang = COALESCE(excluded.lang, ref_tweets.lang),
        media_json = COALESCE(excluded.media_json, ref_tweets.media_json),
        raw_json = COALESCE(excluded.raw_json, ref_tweets.raw_json),
        unavailable_reason = COALESCE(excluded.unavailable_reason, ref_tweets.unavailable_reason),
        updated_at = excluded.updated_at
    `);
    this.stmtDeleteTweetRefsByTweetId = this.db.prepare(`
      DELETE FROM tweet_refs WHERE tweet_id = ?
    `);
    this.stmtInsertTweetRef = this.db.prepare(`
      INSERT INTO tweet_refs (tweet_id, ref_tweet_id, ref_type, source, url, created_at, updated_at)
      VALUES (@tweet_id, @ref_tweet_id, @ref_type, @source, @url, @created_at, @updated_at)
      ON CONFLICT(tweet_id, ref_tweet_id, source) DO UPDATE SET
        ref_type = excluded.ref_type,
        url = excluded.url,
        updated_at = excluded.updated_at
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
    this.stmtUpsertUser.run({
      ...user,
      avatar_url: user.avatar_url ?? null,
      last_seen_at: user.last_seen_at ?? Date.now(),
      monitor_status: user.monitor_status ?? null,
      monitoring_started_at: user.monitoring_started_at ?? null,
      monitoring_ended_at: user.monitoring_ended_at ?? null,
    });
  }

  setUserMonitorStatusById(
    userId: string,
    status: MonitorStatus,
    params: { at?: number; source?: string; reason?: string } = {}
  ): boolean {
    const at = params.at ?? Date.now();
    const txn = this.db.transaction(() => {
      const updated = this.stmtSetUserMonitorStatusById.run(
        status,
        status,
        at,
        status,
        status,
        at,
        userId
      );
      if (!updated.changes) return false;

      if (status === "active") {
        const hasOpen = this.stmtHasOpenMonitoringPeriodByUserId.get(userId) as { id: number } | undefined;
        if (!hasOpen) {
          this.stmtInsertMonitoringPeriod.run(
            userId,
            params.source ?? null,
            params.reason ?? null,
            at,
            at,
            at
          );
        }
      } else if (status === "paused" || status === "removed") {
        this.stmtCloseMonitoringPeriodsByUserId.run(at, at, userId);
      }
      return true;
    });
    return txn();
  }

  setUserMonitorStatusByUsername(
    username: string,
    status: MonitorStatus,
    params: { at?: number; source?: string; reason?: string } = {}
  ): boolean {
    const row = this.stmtGetUserByUsername.get(username) as { id: string } | undefined;
    if (!row?.id) return false;
    return this.setUserMonitorStatusById(row.id, status, params);
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

  upsertRefTweets(refTweets: RefTweetUpsert[]) {
    if (!refTweets.length) return;
    const txn = this.db.transaction((items: RefTweetUpsert[]) => {
      const now = Date.now();
      for (const item of items) {
        this.stmtUpsertRefTweet.run({
          ...item,
          unavailable_reason: item.unavailable_reason ?? null,
          updated_at: now,
        });
      }
    });
    txn(refTweets);
  }

  replaceTweetRefs(tweetId: string, refs: TweetRefInput[]) {
    const txn = this.db.transaction((targetTweetId: string, targetRefs: TweetRefInput[]) => {
      this.stmtDeleteTweetRefsByTweetId.run(targetTweetId);
      if (!targetRefs.length) return;
      const now = Date.now();
      const dedup = new Set<string>();
      for (const ref of targetRefs) {
        const key = `${ref.ref_tweet_id}:${ref.source}`;
        if (dedup.has(key)) continue;
        dedup.add(key);
        this.stmtInsertTweetRef.run({
          tweet_id: targetTweetId,
          ref_tweet_id: ref.ref_tweet_id,
          ref_type: ref.ref_type,
          source: ref.source,
          url: ref.url ?? null,
          created_at: now,
          updated_at: now,
        });
      }
    });
    txn(tweetId, refs);
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
      SELECT
        id,
        username,
        name,
        avatar_url,
        monitor_status,
        monitoring_started_at,
        monitoring_ended_at
      FROM users
      ORDER BY username ASC
    `).all() as {
      id: string;
      username: string;
      name?: string;
      avatar_url?: string;
      monitor_status?: MonitorStatus;
      monitoring_started_at?: number;
      monitoring_ended_at?: number;
    }[];
  }

  queryTweets(opts: {
    username?: string;
    since?: string;
    until?: string;
    contains?: string;
    lang?: string;
    includeHistorical?: boolean;
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
    if (opts.includeHistorical === false) {
      conditions.push("COALESCE(u.monitor_status, 'active') = 'active'");
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const sql = `
      SELECT
        t.*,
        u.username,
        u.name as user_name,
        u.avatar_url as user_avatar_url,
        u.monitor_status as user_monitor_status
      FROM tweets t
      JOIN users u ON t.user_id = u.id
      ${where}
      ORDER BY t.created_at DESC LIMIT ? OFFSET ?
    `;
    params.push(opts.limit ?? 20, opts.offset ?? 0);

    return this.db.prepare(sql).all(...params) as (TweetEntity & {
      username: string;
      user_name?: string;
      user_avatar_url?: string;
      user_monitor_status?: MonitorStatus;
    })[];
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

  getTweetRefsByTweetIds(tweetIds: string[]) {
    if (!tweetIds.length) return {} as Record<string, TweetRefJoined[]>;
    const placeholders = tweetIds.map(() => "?").join(",");
    const rows = this.db.prepare(`
      SELECT
        r.tweet_id,
        r.ref_tweet_id,
        r.ref_type,
        r.source,
        r.url,
        rt.author_id,
        rt.author_username,
        rt.author_name,
        rt.text,
        rt.created_at,
        rt.lang,
        rt.media_json,
        rt.raw_json,
        rt.unavailable_reason
      FROM tweet_refs r
      LEFT JOIN ref_tweets rt ON rt.id = r.ref_tweet_id
      WHERE r.tweet_id IN (${placeholders})
      ORDER BY r.tweet_id ASC, r.created_at ASC
    `).all(...tweetIds) as Array<{
      tweet_id: string;
      ref_tweet_id: string;
      ref_type: string;
      source: "referenced_tweets" | "url";
      url?: string;
      author_id?: string;
      author_username?: string;
      author_name?: string;
      text?: string;
      created_at?: string;
      lang?: string;
      media_json?: string;
      raw_json?: string;
      unavailable_reason?: string;
    }>;

    const missingIds = Array.from(
      new Set(
        rows
          .filter((row) => !row.text && !row.raw_json)
          .map((row) => row.ref_tweet_id)
      )
    );
    const localById = new Map<string, {
      author_id?: string;
      author_username?: string;
      author_name?: string;
      text?: string;
      created_at?: string;
      lang?: string;
      media_json?: string;
      raw_json?: string;
    }>();
    if (missingIds.length) {
      const localPlaceholders = missingIds.map(() => "?").join(",");
      const localRows = this.db.prepare(`
        SELECT
          t.id as ref_tweet_id,
          t.user_id as author_id,
          u.username as author_username,
          u.name as author_name,
          t.text,
          t.created_at,
          t.lang,
          t.media_json,
          t.raw_json
        FROM tweets t
        LEFT JOIN users u ON u.id = t.user_id
        WHERE t.id IN (${localPlaceholders})
      `).all(...missingIds) as Array<{
        ref_tweet_id: string;
        author_id?: string;
        author_username?: string;
        author_name?: string;
        text?: string;
        created_at?: string;
        lang?: string;
        media_json?: string;
        raw_json?: string;
      }>;
      for (const row of localRows) {
        localById.set(row.ref_tweet_id, row);
      }
    }

    const grouped: Record<string, TweetRefJoined[]> = {};
    for (const row of rows) {
      const fallback = localById.get(row.ref_tweet_id);
      const item: TweetRefJoined = {
        ...row,
        author_id: row.author_id ?? fallback?.author_id,
        author_username: row.author_username ?? fallback?.author_username,
        author_name: row.author_name ?? fallback?.author_name,
        text: row.text ?? fallback?.text,
        created_at: row.created_at ?? fallback?.created_at,
        lang: row.lang ?? fallback?.lang,
        media_json: row.media_json ?? fallback?.media_json,
        raw_json: row.raw_json ?? fallback?.raw_json,
        unavailable_reason:
          row.unavailable_reason ??
          (row.text || fallback?.text ? undefined : "unavailable"),
      };
      if (!grouped[row.tweet_id]) grouped[row.tweet_id] = [];
      grouped[row.tweet_id].push(item);
    }
    return grouped;
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
    includeHistorical?: boolean;
  }) {
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (opts.username) { conditions.push("u.username = ? COLLATE NOCASE"); params.push(opts.username); }
    if (opts.since)    { conditions.push("t.created_at >= ?"); params.push(opts.since); }
    if (opts.until)    { conditions.push("t.created_at <= ?"); params.push(opts.until); }
    if (opts.lang)     { conditions.push("t.lang = ?"); params.push(opts.lang); }
    if (opts.contains) { conditions.push("t.text LIKE ? COLLATE NOCASE"); params.push(`%${opts.contains}%`); }
    if (opts.includeHistorical === false) {
      conditions.push("COALESCE(u.monitor_status, 'active') = 'active'");
    }

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

  getUserTweetCounts(): {
    id: string;
    username: string;
    name?: string;
    avatar_url?: string;
    last_seen_at?: number;
    monitor_status?: MonitorStatus;
    monitoring_started_at?: number;
    monitoring_ended_at?: number;
    count: number;
  }[] {
    return this.db.prepare(`
      SELECT
        u.id,
        u.username,
        u.name,
        u.avatar_url,
        u.last_seen_at,
        u.monitor_status,
        u.monitoring_started_at,
        u.monitoring_ended_at,
        COUNT(t.id) as count
      FROM users u
      LEFT JOIN tweets t ON u.id = t.user_id
      GROUP BY u.id
      ORDER BY count DESC
    `).all() as {
      id: string;
      username: string;
      name?: string;
      avatar_url?: string;
      last_seen_at?: number;
      monitor_status?: MonitorStatus;
      monitoring_started_at?: number;
      monitoring_ended_at?: number;
      count: number;
    }[];
  }

  close() {
    this.db.close();
  }
}
