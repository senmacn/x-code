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

// ---------- 拉取逻辑 ----------
export const runFetch = async (): Promise<void> => {
  if (fetchStatus.isRunning) return;
  fetchStatus.isRunning = true;
  try {
    const { config, secrets } = loadConfig();
    const agent = getProxyAgent(config.proxy);
    const client = createXClient(secrets, agent);
    const usernames =
      config.mode === "static" && config.staticUsernames?.length
        ? config.staticUsernames
        : await getMyFollowings(client).catch(() => config.staticUsernames ?? []);
    await fetchForUsernames(client, store, usernames, config.maxPerUser, config.concurrency);
    fetchStatus.lastRunResult = "success";
    fetchStatus.lastRunMessage = `成功拉取 ${usernames.length} 个用户`;
  } catch (e: any) {
    fetchStatus.lastRunResult = "error";
    fetchStatus.lastRunMessage = e?.message || String(e);
    logger.error({ error: fetchStatus.lastRunMessage }, "拉取任务失败");
  } finally {
    fetchStatus.isRunning = false;
    fetchStatus.lastRunAt = new Date().toISOString();
  }
};

// ---------- 调度器 ----------
let cronTask: ReturnType<typeof cron.schedule> | null = null;

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

// ---------- Express 应用 ----------
const app = express();
app.use(cors());
app.use(express.json());

// --- 状态 ---
app.get("/api/status", (_req, res) => {
  const { config } = loadConfig();
  res.json({ ...fetchStatus, schedule: config.schedule });
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
  const users = store.getUserTweetCounts();
  res.json({ users });
});

const normalizeUsername = (value: string) => value.replace(/^@/, "").trim();
const isValidUsername = (value: string) => /^[A-Za-z0-9_]{1,15}$/.test(value);

app.post("/api/users", (req, res) => {
  const { username } = req.body as { username?: string };
  if (!username) return res.status(400).json({ error: "username 必填" });
  const { config } = loadConfig();
  if (config.mode !== "static") return res.status(400).json({ error: "仅静态模式支持手动添加用户" });
  const clean = normalizeUsername(username);
  if (!isValidUsername(clean)) {
    return res.status(400).json({ error: "用户名不合法（仅支持字母、数字、下划线，长度 1-15）" });
  }
  const list = config.staticUsernames ?? [];
  const normalized = list.map((u) => normalizeUsername(u).toLowerCase());
  if (normalized.includes(clean.toLowerCase())) {
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
  const list = (config.staticUsernames ?? []).filter((u) => normalizeUsername(u).toLowerCase() !== clean);
  saveConfig({ ...config, staticUsernames: list });
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

    if (next.proxy !== undefined && typeof next.proxy !== "string") {
      return res.status(400).json({ error: "proxy 必须是字符串" });
    }

    if (next.staticUsernames !== undefined && !Array.isArray(next.staticUsernames)) {
      return res.status(400).json({ error: "staticUsernames 必须是字符串数组" });
    }

    const validatedStaticUsernames = Array.isArray(next.staticUsernames)
      ? next.staticUsernames.map((u) => normalizeUsername(String(u))).filter(Boolean)
      : undefined;

    const validatedConfig: AppConfig = {
      mode: next.mode,
      staticUsernames: validatedStaticUsernames,
      schedule: next.schedule,
      proxy: typeof next.proxy === "string" && next.proxy.trim() ? next.proxy.trim() : undefined,
      maxPerUser: next.maxPerUser as number,
      concurrency: next.concurrency as number,
    };

    saveConfig(validatedConfig);
    // 若 schedule 变更，重启调度器
    if (updated.schedule && updated.schedule !== config.schedule) {
      startCron(validatedConfig.schedule);
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

const { config } = loadConfig();
startCron(config.schedule);
runFetch().catch(() => {});

app.listen(PORT, () => {
  logger.info({ port: PORT }, "API 服务已启动");
  console.log(`\n  API Server: http://localhost:${PORT}/api/status\n`);
});

export default app;
