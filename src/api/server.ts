import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { loadConfig, saveConfig } from "../config";
import { getProxyAgent } from "../utils/proxy";
import { createXClient, getMyFollowings } from "../clients/xClient";
import type { AppConfig } from "../data/types";
import { Store } from "../data/store";
import { fetchForUsernames } from "../services/fetcher";
import {
  backfillMediaCache,
  cleanupMediaCache,
  resolveMediaCacheRoot,
} from "../services/mediaCache";
import { logger } from "../utils/logger";
import cron from "node-cron";

// ---------- 共享状态 ----------
export const store = new Store();
export const fetchStatus = {
  isRunning: false,
  lastRunAt: null as string | null,
  lastRunResult: "idle" as "idle" | "success" | "error",
  lastRunMessage: "",
  nextRunAt: null as string | null,
};
export const mediaBackfillStatus = {
  isRunning: false,
  lastRunAt: null as string | null,
  lastRunResult: "idle" as "idle" | "success" | "error",
  lastRunMessage: "",
};
export const mediaCleanupStatus = {
  isRunning: false,
  lastRunAt: null as string | null,
  lastRunResult: "idle" as "idle" | "success" | "error",
  lastRunMessage: "",
};
const TASK_KEYS = {
  fetch: "fetch",
  mediaBackfill: "media-backfill",
  mediaCleanup: "media-cleanup",
} as const;
const TASK_STALE_AFTER_MS = 10 * 60 * 1000;
const TASK_RETRY_DELAY_MS = 60 * 1000;

const normalizeUsername = (value: string) => value.replace(/^@/, "").trim();
const isValidUsername = (value: string) => /^[A-Za-z0-9_]{1,15}$/.test(value);
const normalizeUsernameList = (usernames?: string[]): string[] => {
  if (!Array.isArray(usernames)) return [];
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const raw of usernames) {
    const clean = normalizeUsername(String(raw));
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(clean);
  }
  return normalized;
};

const mergeStaticUsersWithStats = (
  staticUsernames: string[],
  stats: ReturnType<Store["getUserTweetCounts"]>
) => {
  const statsByUsername = new Map(
    stats.map((u) => [normalizeUsername(u.username).toLowerCase(), u])
  );

  return staticUsernames.map((username) => {
    const hit = statsByUsername.get(username.toLowerCase());
    if (hit) return { ...hit, username };
    return {
      id: `static:${username}`,
      username,
      name: undefined,
      last_seen_at: undefined,
      count: 0,
    };
  });
};

const ensureMediaCacheDir = (config: AppConfig) => {
  const mediaRoot = resolveMediaCacheRoot(config);
  fs.mkdirSync(mediaRoot, { recursive: true });
  return mediaRoot;
};

const parseJsonSafe = <T>(value?: string | null): T | undefined => {
  if (!value) return undefined;
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
};

const toRetryAtIso = (ms?: number | null) => (ms ? new Date(ms).toISOString() : undefined);

const listTaskRunStates = () => {
  const rows = store.listTaskRuns([
    TASK_KEYS.fetch,
    TASK_KEYS.mediaBackfill,
    TASK_KEYS.mediaCleanup,
  ]);
  return rows.map((row) => ({
    taskKey: row.task_key,
    status: row.status,
    attempt: row.attempt,
    nextRetryAt: toRetryAtIso(row.next_retry_at),
    heartbeatAt: toRetryAtIso(row.heartbeat_at),
    startedAt: toRetryAtIso(row.started_at),
    finishedAt: toRetryAtIso(row.finished_at),
    lastError: row.last_error ?? null,
  }));
};

// ---------- 拉取逻辑 ----------
export const runFetch = async (): Promise<void> => {
  if (fetchStatus.isRunning) return;

  try {
    const { config, secrets } = loadConfig();
    const acquired = store.acquireTaskRun(TASK_KEYS.fetch, {
      payload_json: JSON.stringify({
        schedule: config.schedule,
        mode: config.mode,
      }),
      staleAfterMs: TASK_STALE_AFTER_MS,
    });
    if (!acquired.acquired) {
      fetchStatus.isRunning = false;
      fetchStatus.lastRunResult = "error";
      fetchStatus.lastRunMessage =
        acquired.reason === "retry_wait"
          ? `抓取任务等待重试至 ${toRetryAtIso(acquired.task.next_retry_at)}`
          : "抓取任务正在执行中";
      fetchStatus.lastRunAt = new Date().toISOString();
      return;
    }

    fetchStatus.isRunning = true;
    const agent = getProxyAgent(config.proxy);
    const client = createXClient(secrets, agent);
    const staticUsernames = normalizeUsernameList(config.staticUsernames);
    const usernames =
      config.mode === "static" && staticUsernames.length
        ? staticUsernames
        : await getMyFollowings(client).catch(() => staticUsernames);
    ensureMediaCacheDir(config);
    const summary = await fetchForUsernames(
      client,
      store,
      usernames,
      config.maxPerUser,
      config.concurrency,
      config,
      {
        onProgress: (progress) => {
          store.touchTaskRun(TASK_KEYS.fetch, JSON.stringify(progress));
        },
      }
    );
    const isHardFailure = summary.successUsers === 0 && summary.fetchedTweets === 0;
    fetchStatus.lastRunResult = isHardFailure ? "error" : "success";
    fetchStatus.lastRunMessage = [
      `用户 ${summary.totalUsers}`,
      `成功 ${summary.successUsers}`,
      `新增推文 ${summary.fetchedTweets}`,
      summary.rateLimitedUsers ? `限流 ${summary.rateLimitedUsers}` : null,
      summary.skippedRateLimitedUsers ? `冷却跳过 ${summary.skippedRateLimitedUsers}` : null,
      summary.failedUsers ? `失败 ${summary.failedUsers}` : null,
    ]
      .filter(Boolean)
      .join(" · ");
    store.succeedTaskRun(TASK_KEYS.fetch, {
      resultJson: JSON.stringify(summary),
      progressJson: JSON.stringify({ ...summary, processedUsers: summary.totalUsers }),
    });
  } catch (e: any) {
    fetchStatus.lastRunResult = "error";
    fetchStatus.lastRunMessage = e?.message || String(e);
    const nextRetryAt = Date.now() + TASK_RETRY_DELAY_MS;
    store.failTaskRun(TASK_KEYS.fetch, {
      error: fetchStatus.lastRunMessage,
      nextRetryAt,
    });
    fetchStatus.lastRunMessage = `${fetchStatus.lastRunMessage}（将于 ${new Date(nextRetryAt).toISOString()} 重试）`;
    logger.error({ error: fetchStatus.lastRunMessage }, "拉取任务失败");
  } finally {
    fetchStatus.isRunning = false;
    fetchStatus.lastRunAt = new Date().toISOString();
  }
};

const runMediaBackfill = async (input?: {
  usernames?: string[];
  limit?: number;
  force?: boolean;
}): Promise<void> => {
  if (mediaBackfillStatus.isRunning) return;

  try {
    const { config } = loadConfig();
    const usernames = normalizeUsernameList(input?.usernames);
    const limit = Math.max(1, Math.min(5000, Math.floor(input?.limit ?? 500)));
    const force = Boolean(input?.force);
    const payload = { usernames, limit, force };
    const payloadJson = JSON.stringify(payload);
    const lastRun = store.getTaskRun(TASK_KEYS.mediaBackfill);
    const shouldResume =
      !!lastRun &&
      (lastRun.status === "running" || lastRun.status === "failed") &&
      lastRun.payload_json === payloadJson;
    const acquired = store.acquireTaskRun(TASK_KEYS.mediaBackfill, {
      payload_json: payloadJson,
      staleAfterMs: TASK_STALE_AFTER_MS,
      resetProgress: !shouldResume,
    });
    if (!acquired.acquired) {
      mediaBackfillStatus.isRunning = false;
      mediaBackfillStatus.lastRunResult = "error";
      mediaBackfillStatus.lastRunMessage =
        acquired.reason === "retry_wait"
          ? `媒体回填等待重试至 ${toRetryAtIso(acquired.task.next_retry_at)}`
          : "媒体回填任务正在执行中";
      mediaBackfillStatus.lastRunAt = new Date().toISOString();
      return;
    }

    mediaBackfillStatus.isRunning = true;
    const resume = shouldResume
      ? parseJsonSafe<{
          offset?: number;
          scannedTweets?: number;
          updatedTweets?: number;
          cachedFiles?: number;
          failedFiles?: number;
        }>(acquired.task.progress_json)
      : undefined;
    ensureMediaCacheDir(config);
    const summary = await backfillMediaCache({
      store,
      config,
      usernames,
      limit,
      force,
      resume,
      onProgress: (progress) => {
        store.touchTaskRun(TASK_KEYS.mediaBackfill, JSON.stringify(progress));
      },
    });
    mediaBackfillStatus.lastRunResult = "success";
    mediaBackfillStatus.lastRunMessage = [
      `扫描 ${summary.scannedTweets} 条`,
      `更新 ${summary.updatedTweets} 条`,
      `缓存文件 ${summary.cachedFiles} 个`,
      summary.failedFiles ? `失败 ${summary.failedFiles} 个` : null,
    ]
      .filter(Boolean)
      .join(" · ");
    store.succeedTaskRun(TASK_KEYS.mediaBackfill, {
      resultJson: JSON.stringify(summary),
      progressJson: JSON.stringify({
        ...summary,
        limit,
        force,
        usernames,
        running: false,
      }),
    });
  } catch (e: any) {
    mediaBackfillStatus.lastRunResult = "error";
    mediaBackfillStatus.lastRunMessage = e?.message || String(e);
    const nextRetryAt = Date.now() + TASK_RETRY_DELAY_MS;
    store.failTaskRun(TASK_KEYS.mediaBackfill, {
      error: mediaBackfillStatus.lastRunMessage,
      nextRetryAt,
    });
    mediaBackfillStatus.lastRunMessage = `${mediaBackfillStatus.lastRunMessage}（将于 ${new Date(nextRetryAt).toISOString()} 重试）`;
    logger.error({ error: mediaBackfillStatus.lastRunMessage }, "媒体回填任务失败");
  } finally {
    mediaBackfillStatus.isRunning = false;
    mediaBackfillStatus.lastRunAt = new Date().toISOString();
  }
};

const runMediaCleanup = async (): Promise<void> => {
  if (mediaCleanupStatus.isRunning) return;

  try {
    const { config } = loadConfig();
    const acquired = store.acquireTaskRun(TASK_KEYS.mediaCleanup, {
      payload_json: JSON.stringify({
        cleanupCron: config.mediaCache?.cleanupCron,
        ttlDays: config.mediaCache?.ttlDays,
        maxDiskUsage: config.mediaCache?.maxDiskUsage,
      }),
      staleAfterMs: TASK_STALE_AFTER_MS,
    });
    if (!acquired.acquired) {
      mediaCleanupStatus.isRunning = false;
      mediaCleanupStatus.lastRunResult = "error";
      mediaCleanupStatus.lastRunMessage =
        acquired.reason === "retry_wait"
          ? `媒体清理等待重试至 ${toRetryAtIso(acquired.task.next_retry_at)}`
          : "媒体清理任务正在执行中";
      mediaCleanupStatus.lastRunAt = new Date().toISOString();
      return;
    }

    mediaCleanupStatus.isRunning = true;
    ensureMediaCacheDir(config);
    const summary = await cleanupMediaCache({
      store,
      config,
    });
    mediaCleanupStatus.lastRunResult = "success";
    mediaCleanupStatus.lastRunMessage = [
      `扫描资产 ${summary.scannedAssets} 个`,
      summary.deletedAssets ? `删除资产 ${summary.deletedAssets} 个` : "无需删除",
      summary.deletedFiles ? `删除文件 ${summary.deletedFiles} 个` : null,
      summary.releasedBytes ? `释放 ${(summary.releasedBytes / 1024 / 1024).toFixed(2)} MB` : null,
      summary.ttlEvictions ? `TTL 淘汰 ${summary.ttlEvictions} 个` : null,
      summary.capacityEvictions ? `容量淘汰 ${summary.capacityEvictions} 个` : null,
      summary.updatedTweets ? `修正推文 ${summary.updatedTweets} 条` : null,
    ]
      .filter(Boolean)
      .join(" · ");
    store.succeedTaskRun(TASK_KEYS.mediaCleanup, {
      resultJson: JSON.stringify(summary),
      progressJson: JSON.stringify({
        scannedAssets: summary.scannedAssets,
        deletedAssets: summary.deletedAssets,
        running: false,
      }),
    });
  } catch (e: any) {
    mediaCleanupStatus.lastRunResult = "error";
    mediaCleanupStatus.lastRunMessage = e?.message || String(e);
    const nextRetryAt = Date.now() + TASK_RETRY_DELAY_MS;
    store.failTaskRun(TASK_KEYS.mediaCleanup, {
      error: mediaCleanupStatus.lastRunMessage,
      nextRetryAt,
    });
    mediaCleanupStatus.lastRunMessage = `${mediaCleanupStatus.lastRunMessage}（将于 ${new Date(nextRetryAt).toISOString()} 重试）`;
    logger.error({ error: mediaCleanupStatus.lastRunMessage }, "媒体缓存清理任务失败");
  } finally {
    mediaCleanupStatus.isRunning = false;
    mediaCleanupStatus.lastRunAt = new Date().toISOString();
  }
};

// ---------- 调度器 ----------
let cronTask: ReturnType<typeof cron.schedule> | null = null;
let mediaCleanupCronTask: ReturnType<typeof cron.schedule> | null = null;

const computeNextRun = (cronExp: string): string | null => {
  try {
    // 简单推算：用当前时间 + cron 间隔近似值
    const now = new Date();
    now.setSeconds(0, 0);
    now.setMinutes(now.getMinutes() + 1);
    return now.toISOString();
  } catch {
    return null;
  }
};

export const startCron = (cronExp: string) => {
  cronTask?.stop();
  if (!cron.validate(cronExp)) return;
  cronTask = cron.schedule(cronExp, async () => {
    await runFetch();
    fetchStatus.nextRunAt = computeNextRun(cronExp);
  });
  fetchStatus.nextRunAt = computeNextRun(cronExp);
  logger.info({ cron: cronExp }, "调度器已启动");
};

export const startMediaCleanupCron = (cronExp: string) => {
  mediaCleanupCronTask?.stop();
  if (!cron.validate(cronExp)) return;
  mediaCleanupCronTask = cron.schedule(cronExp, async () => {
    await runMediaCleanup();
  });
  logger.info({ cron: cronExp }, "媒体缓存清理调度器已启动");
};

// ---------- Express 应用 ----------
const app = express();
app.use(cors());
app.use(express.json());

const { config: startupConfig } = loadConfig();
ensureMediaCacheDir(startupConfig);
app.get("/api/media-cache/*", (req, res) => {
  try {
    const raw = String((req.params as Record<string, string>)[0] ?? "");
    if (!raw) return res.status(400).json({ error: "invalid media path" });
    const relativePath = raw
      .split("/")
      .map((segment) => decodeURIComponent(segment))
      .join(path.sep);
    if (relativePath.includes("..")) {
      return res.status(400).json({ error: "invalid media path" });
    }

    const { config } = loadConfig();
    const rootDir = ensureMediaCacheDir(config);
    const absPath = path.resolve(rootDir, relativePath);
    const rootPrefix = rootDir.endsWith(path.sep) ? rootDir : `${rootDir}${path.sep}`;
    if (absPath !== rootDir && !absPath.startsWith(rootPrefix)) {
      return res.status(400).json({ error: "invalid media path" });
    }
    if (!fs.existsSync(absPath)) {
      return res.status(404).json({ error: "media not found" });
    }
    store.touchMediaAssetByRelativePath(relativePath.split(path.sep).join("/"));
    res.sendFile(absPath);
  } catch {
    res.status(400).json({ error: "invalid media path" });
  }
});

// --- 状态 ---
app.get("/api/status", (_req, res) => {
  const { config } = loadConfig();
  res.json({
    ...fetchStatus,
    schedule: config.schedule,
    mediaBackfill: mediaBackfillStatus,
    mediaCleanup: mediaCleanupStatus,
    taskRuns: listTaskRunStates(),
  });
});

// --- 推文 ---
app.get("/api/tweets", (req, res) => {
  const { username, since, until, contains, lang, limit = "50", offset = "0" } = req.query as Record<string, string>;
  const opts = {
    username: username || undefined,
    since: since || undefined,
    until: until || undefined,
    contains: contains || undefined,
    lang: lang || undefined,
    limit: Math.min(parseInt(limit) || 50, 200),
    offset: parseInt(offset) || 0,
  };
  const tweets = store.queryTweets(opts);
  const total = store.countTweets(opts);
  res.json({ tweets, total });
});

app.get("/api/tweets/stats", (_req, res) => {
  res.json({
    total: store.getTotalTweetCount(),
    today: store.getTodayTweetCount(),
  });
});

// --- 用户 ---
app.get("/api/users", (_req, res) => {
  const { config } = loadConfig();
  const users =
    config.mode === "static"
      ? mergeStaticUsersWithStats(
          normalizeUsernameList(config.staticUsernames),
          store.getUserTweetCounts()
        )
      : store.getUserTweetCounts();
  res.json({ users });
});

app.post("/api/users", (req, res) => {
  const { username } = req.body as { username?: string };
  if (!username) return res.status(400).json({ error: "username 必填" });
  const { config } = loadConfig();
  if (config.mode !== "static") return res.status(400).json({ error: "仅静态模式支持手动添加用户" });
  const clean = normalizeUsername(username);
  if (!isValidUsername(clean)) {
    return res.status(400).json({ error: "用户名不合法（仅支持字母、数字、下划线，长度 1-15）" });
  }
  const list = normalizeUsernameList(config.staticUsernames);
  if (list.some((u) => u.toLowerCase() === clean.toLowerCase())) {
    return res.status(409).json({ error: "用户已存在" });
  }
  saveConfig({ ...config, staticUsernames: [...list, clean] });
  res.json({ ok: true });
});

app.delete("/api/users/:username", (req, res) => {
  const { username } = req.params;
  const { config } = loadConfig();
  if (config.mode !== "static") return res.status(400).json({ error: "仅静态模式支持删除用户" });
  const clean = normalizeUsername(username).toLowerCase();
  const list = normalizeUsernameList(config.staticUsernames);
  const nextList = list.filter((u) => u.toLowerCase() !== clean);
  saveConfig({ ...config, staticUsernames: nextList });
  res.json({ ok: true });
});

// --- 分析 ---
app.get("/api/analytics/daily", (req, res) => {
  const days = parseInt((req.query.days as string) || "30") || 30;
  res.json({ data: store.getDailyTweetCounts(days) });
});

app.get("/api/analytics/users", (_req, res) => {
  res.json({ data: store.getUserTweetCounts() });
});

// --- 配置 ---
app.get("/api/config", (_req, res) => {
  const { config } = loadConfig();
  res.json(config);
});

app.put("/api/config", (req, res) => {
  try {
    const updated = req.body as Record<string, unknown>;
    const { config } = loadConfig();
    const next = { ...config, ...updated } as Record<string, unknown>;

    if (typeof next.schedule !== "string" || !cron.validate(next.schedule)) {
      return res.status(400).json({ error: "无效的 cron 表达式" });
    }
    if (!Number.isInteger(next.maxPerUser) || (next.maxPerUser as number) < 1) {
      return res.status(400).json({ error: "maxPerUser 必须是大于 0 的整数" });
    }
    if (!Number.isInteger(next.concurrency) || (next.concurrency as number) < 1 || (next.concurrency as number) > 10) {
      return res.status(400).json({ error: "concurrency 必须是 1-10 的整数" });
    }

    if (next.mode !== "static" && next.mode !== "dynamic") {
      return res.status(400).json({ error: "mode 必须是 static 或 dynamic" });
    }

    if (next.proxy !== undefined && next.proxy !== null && typeof next.proxy !== "string") {
      return res.status(400).json({ error: "proxy 必须是字符串或 null" });
    }

    if (next.staticUsernames !== undefined && !Array.isArray(next.staticUsernames)) {
      return res.status(400).json({ error: "staticUsernames 必须是字符串数组" });
    }
    if (next.priorityUsernames !== undefined && !Array.isArray(next.priorityUsernames)) {
      return res.status(400).json({ error: "priorityUsernames 必须是字符串数组" });
    }
    if (
      next.mediaCache !== undefined &&
      (typeof next.mediaCache !== "object" || next.mediaCache === null || Array.isArray(next.mediaCache))
    ) {
      return res.status(400).json({ error: "mediaCache 必须是对象" });
    }

    const rawStaticUsernames = Array.isArray(next.staticUsernames)
      ? next.staticUsernames.map((u) => normalizeUsername(String(u))).filter(Boolean)
      : [];
    const invalidUsername = rawStaticUsernames.find((u) => !isValidUsername(u));
    if (invalidUsername) {
      return res.status(400).json({
        error: `staticUsernames 存在不合法用户名: ${invalidUsername}`,
      });
    }
    const validatedStaticUsernames = Array.isArray(next.staticUsernames)
      ? normalizeUsernameList(rawStaticUsernames)
      : undefined;

    const rawPriorityUsernames = Array.isArray(next.priorityUsernames)
      ? next.priorityUsernames.map((u) => normalizeUsername(String(u))).filter(Boolean)
      : [];
    const invalidPriorityUsername = rawPriorityUsernames.find((u) => !isValidUsername(u));
    if (invalidPriorityUsername) {
      return res.status(400).json({
        error: `priorityUsernames 存在不合法用户名: ${invalidPriorityUsername}`,
      });
    }
    const validatedPriorityUsernames = Array.isArray(next.priorityUsernames)
      ? normalizeUsernameList(rawPriorityUsernames)
      : undefined;

    const previousMediaCfg = config.mediaCache ?? {
      enabled: true,
      rootDir: "media-cache",
      cacheForPriorityOnly: true,
      includeVideoFiles: false,
      requestTimeoutMs: 12000,
      maxDiskUsage: 2048,
      ttlDays: 30,
      cleanupCron: "0 * * * *",
    };
    const nextMediaInput = (next.mediaCache ?? {}) as Record<string, unknown>;
    if (nextMediaInput.enabled !== undefined && typeof nextMediaInput.enabled !== "boolean") {
      return res.status(400).json({ error: "mediaCache.enabled 必须是布尔值" });
    }
    if (nextMediaInput.rootDir !== undefined && typeof nextMediaInput.rootDir !== "string") {
      return res.status(400).json({ error: "mediaCache.rootDir 必须是字符串" });
    }
    if (
      nextMediaInput.cacheForPriorityOnly !== undefined &&
      typeof nextMediaInput.cacheForPriorityOnly !== "boolean"
    ) {
      return res.status(400).json({ error: "mediaCache.cacheForPriorityOnly 必须是布尔值" });
    }
    if (
      nextMediaInput.includeVideoFiles !== undefined &&
      typeof nextMediaInput.includeVideoFiles !== "boolean"
    ) {
      return res.status(400).json({ error: "mediaCache.includeVideoFiles 必须是布尔值" });
    }
    if (
      nextMediaInput.requestTimeoutMs !== undefined &&
      (!Number.isInteger(nextMediaInput.requestTimeoutMs) ||
        (nextMediaInput.requestTimeoutMs as number) < 1000 ||
        (nextMediaInput.requestTimeoutMs as number) > 60000)
    ) {
      return res.status(400).json({ error: "mediaCache.requestTimeoutMs 必须是 1000-60000 的整数" });
    }
    if (
      nextMediaInput.maxDiskUsage !== undefined &&
      (!Number.isInteger(nextMediaInput.maxDiskUsage) ||
        (nextMediaInput.maxDiskUsage as number) < 100 ||
        (nextMediaInput.maxDiskUsage as number) > 1024 * 1024)
    ) {
      return res.status(400).json({ error: "mediaCache.maxDiskUsage 必须是 100-1048576 的整数（单位 MB）" });
    }
    if (
      nextMediaInput.ttlDays !== undefined &&
      (!Number.isInteger(nextMediaInput.ttlDays) ||
        (nextMediaInput.ttlDays as number) < 1 ||
        (nextMediaInput.ttlDays as number) > 3650)
    ) {
      return res.status(400).json({ error: "mediaCache.ttlDays 必须是 1-3650 的整数" });
    }
    if (nextMediaInput.cleanupCron !== undefined && typeof nextMediaInput.cleanupCron !== "string") {
      return res.status(400).json({ error: "mediaCache.cleanupCron 必须是字符串" });
    }
    if (
      typeof nextMediaInput.cleanupCron === "string" &&
      !cron.validate(nextMediaInput.cleanupCron)
    ) {
      return res.status(400).json({ error: "mediaCache.cleanupCron 是无效的 cron 表达式" });
    }
    const validatedMediaCache = {
      enabled:
        typeof nextMediaInput.enabled === "boolean"
          ? nextMediaInput.enabled
          : previousMediaCfg.enabled,
      rootDir:
        typeof nextMediaInput.rootDir === "string" && nextMediaInput.rootDir.trim()
          ? nextMediaInput.rootDir.trim()
          : previousMediaCfg.rootDir,
      cacheForPriorityOnly:
        typeof nextMediaInput.cacheForPriorityOnly === "boolean"
          ? nextMediaInput.cacheForPriorityOnly
          : previousMediaCfg.cacheForPriorityOnly,
      includeVideoFiles:
        typeof nextMediaInput.includeVideoFiles === "boolean"
          ? nextMediaInput.includeVideoFiles
          : previousMediaCfg.includeVideoFiles,
      requestTimeoutMs:
        typeof nextMediaInput.requestTimeoutMs === "number"
          ? nextMediaInput.requestTimeoutMs
          : previousMediaCfg.requestTimeoutMs,
      maxDiskUsage:
        typeof nextMediaInput.maxDiskUsage === "number"
          ? nextMediaInput.maxDiskUsage
          : previousMediaCfg.maxDiskUsage ?? 2048,
      ttlDays:
        typeof nextMediaInput.ttlDays === "number"
          ? nextMediaInput.ttlDays
          : previousMediaCfg.ttlDays ?? 30,
      cleanupCron:
        typeof nextMediaInput.cleanupCron === "string" && nextMediaInput.cleanupCron.trim()
          ? nextMediaInput.cleanupCron.trim()
          : previousMediaCfg.cleanupCron ?? "0 * * * *",
    };

    const validatedConfig: AppConfig = {
      mode: next.mode,
      staticUsernames: validatedStaticUsernames,
      priorityUsernames: validatedPriorityUsernames,
      schedule: next.schedule,
      proxy: typeof next.proxy === "string" ? next.proxy.trim() : undefined,
      maxPerUser: next.maxPerUser as number,
      concurrency: next.concurrency as number,
      mediaCache: validatedMediaCache,
    };

    saveConfig(validatedConfig);
    // 若 schedule 变更，重启调度器
    if (updated.schedule && updated.schedule !== config.schedule) {
      startCron(validatedConfig.schedule);
    }
    if (
      updated.mediaCache &&
      validatedMediaCache.cleanupCron !== (config.mediaCache?.cleanupCron ?? "0 * * * *")
    ) {
      startMediaCleanupCron(validatedMediaCache.cleanupCron);
    }
    res.json({ ok: true });
  } catch (e: any) {
    res.status(400).json({ error: e?.message || "保存配置失败" });
  }
});

// --- 手动触发拉取 ---
app.post("/api/actions/fetch", async (_req, res) => {
  if (fetchStatus.isRunning) return res.status(409).json({ error: "拉取任务正在进行中" });
  runFetch(); // 异步执行，不等待
  res.json({ ok: true, message: "拉取任务已启动" });
});

app.post("/api/actions/media-backfill", async (req, res) => {
  if (mediaBackfillStatus.isRunning) {
    return res.status(409).json({ error: "媒体回填任务正在进行中" });
  }

  const body = (req.body ?? {}) as {
    usernames?: string[];
    limit?: number;
    force?: boolean;
  };
  const usernames = Array.isArray(body.usernames)
    ? normalizeUsernameList(body.usernames)
    : undefined;
  const limit =
    typeof body.limit === "number" && Number.isFinite(body.limit)
      ? Math.max(1, Math.min(5000, Math.floor(body.limit)))
      : 500;
  const force = typeof body.force === "boolean" ? body.force : false;

  runMediaBackfill({ usernames, limit, force });
  res.json({ ok: true, message: "媒体回填任务已启动" });
});

// --- 生产模式：托管前端静态文件 ---
const webDistPath = path.join(process.cwd(), "web", "out");
if (fs.existsSync(webDistPath)) {
  app.use(express.static(webDistPath));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(webDistPath, "index.html"));
  });
}

// ---------- 启动 ----------
const PORT = parseInt(process.env.API_PORT || "3081");

const resumeMediaBackfillIfNeeded = async () => {
  const row = store.getTaskRun(TASK_KEYS.mediaBackfill);
  if (!row) return;
  if (row.status !== "running" && row.status !== "failed") return;
  if (Number.isFinite(row.next_retry_at) && (row.next_retry_at as number) > Date.now()) return;
  const payload = parseJsonSafe<{
    usernames?: string[];
    limit?: number;
    force?: boolean;
  }>(row.payload_json);
  await runMediaBackfill(payload);
};

const { config } = loadConfig();
startCron(config.schedule);
startMediaCleanupCron(config.mediaCache?.cleanupCron ?? "0 * * * *");
runFetch().catch(() => {});
runMediaCleanup().catch(() => {});
resumeMediaBackfillIfNeeded().catch(() => {});

app.listen(PORT, () => {
  logger.info({ port: PORT }, "API 服务已启动");
  console.log(`\n  API Server: http://localhost:${PORT}/api/status\n`);
});

export default app;
