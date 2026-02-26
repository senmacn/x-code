import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { loadConfig, saveConfig } from "../config";
import { getProxyAgent } from "../utils/proxy";
import { createXClient, getMyFollowings } from "../clients/xClient";
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

app.post("/api/users", (req, res) => {
  const { username } = req.body as { username?: string };
  if (!username) return res.status(400).json({ error: "username 必填" });
  const { config } = loadConfig();
  if (config.mode !== "static") return res.status(400).json({ error: "仅静态模式支持手动添加用户" });
  const clean = username.replace(/^@/, "").trim();
  const list = config.staticUsernames ?? [];
  if (list.map((u) => u.replace(/^@/, "")).includes(clean)) {
    return res.status(409).json({ error: "用户已存在" });
  }
  saveConfig({ ...config, staticUsernames: [...list, clean] });
  res.json({ ok: true });
});

app.delete("/api/users/:username", (req, res) => {
  const { username } = req.params;
  const { config } = loadConfig();
  if (config.mode !== "static") return res.status(400).json({ error: "仅静态模式支持删除用户" });
  const clean = username.replace(/^@/, "").trim();
  const list = (config.staticUsernames ?? []).filter((u) => u.replace(/^@/, "") !== clean);
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
    const next = { ...config, ...updated };
    saveConfig(next);
    // 若 schedule 变更，重启调度器
    if (updated.schedule && updated.schedule !== config.schedule) {
      startCron(next.schedule);
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
const PORT = parseInt(process.env.API_PORT || "3001");

const { config } = loadConfig();
startCron(config.schedule);
runFetch().catch(() => {});

app.listen(PORT, () => {
  logger.info({ port: PORT }, "API 服务已启动");
  console.log(`\n  API Server: http://localhost:${PORT}/api/status\n`);
});

export default app;
