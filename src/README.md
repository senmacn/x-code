# 后端 (src/)

Express API 服务 + 定时拉取调度器，基于 TypeScript + SQLite。

## 目录结构

```
src/
├── api/
│   └── server.ts          Express 服务入口，整合调度器与所有路由
├── cli/
│   └── index.ts           CLI 入口（start / fetch-once / show）
├── clients/
│   └── xClient.ts         twitter-api-v2 封装，处理 OAuth 与 Bearer Token
├── config/
│   └── index.ts           Zod 配置校验、loadConfig、saveConfig
├── data/
│   ├── store.ts           SQLite 数据层（better-sqlite3）
│   └── types.ts           AppConfig / UserEntity / TweetEntity 类型定义
├── services/
│   ├── fetcher.ts         批量拉取推文并写入 Store
│   └── scheduler.ts       node-cron 调度封装
└── utils/
    ├── logger.ts          Pino 日志
    ├── proxy.ts           HTTPS 代理 Agent
    └── text.ts            文本截断
```

---

## API 服务启动

```bash
npm run serve              # ts-node 直接运行
```

服务监听 `http://127.0.0.1:3081`，启动时会立即执行一次拉取并注册 cron 调度。

---

## REST API 端点

### 状态

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/status` | 调度器状态（是否运行中、上次/下次时间、schedule） |

**响应示例**
```json
{
  "isRunning": false,
  "lastRunAt": "2024-01-01T12:00:00.000Z",
  "lastRunResult": "success",
  "lastRunMessage": "成功拉取 3 个用户",
  "nextRunAt": "2024-01-01T12:15:00.000Z",
  "schedule": "*/15 * * * *"
}
```

### 推文

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/tweets` | 推文列表，支持筛选与分页 |
| GET | `/api/tweets/stats` | 推文统计（总数 / 今日新增） |

`GET /api/tweets` 查询参数：

| 参数 | 说明 |
|------|------|
| `username` | 按用户名筛选 |
| `since` | 起始时间（ISO 8601） |
| `until` | 结束时间（ISO 8601） |
| `contains` | 关键词全文搜索 |
| `lang` | 语言代码（如 `zh`、`en`） |
| `limit` | 每页条数，默认 50，最大 200 |
| `offset` | 分页偏移，默认 0 |

### 用户

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/users` | 用户列表（含推文计数） |
| POST | `/api/users` | 添加监控用户（仅 static 模式） |
| DELETE | `/api/users/:username` | 移除监控用户（仅 static 模式） |

### 分析

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/analytics/daily?days=30` | 每日推文数量（最近 N 天） |
| GET | `/api/analytics/users` | 用户发帖数量排行 |

### 配置

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/config` | 读取当前配置 |
| PUT | `/api/config` | 保存配置（写入 `config.json`，schedule 变更时自动重启 cron） |

### 操作

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/actions/fetch` | 立即触发一次拉取（异步，不等待完成） |

---

## CLI 命令

```bash
npm run dev              # 启动定时拉取守护进程（等同于 start 命令）
npm run fetch-once       # 立即拉取一次后退出
npm run show             # 终端查看推文
```

`show` 命令参数：

```bash
--user <username>        # 指定用户名
--limit <n>              # 显示条数（默认 20）
--since <ISO>            # 起始时间
--until <ISO>            # 结束时间
--contains <keyword>     # 关键词过滤
--lang <code>            # 语言代码
--users                  # 显示已跟踪的用户列表
--json                   # 以 JSON 行输出（便于导出）
```

---

## 数据库 Schema

```sql
-- 用户表
CREATE TABLE users (
  id          TEXT PRIMARY KEY,
  username    TEXT NOT NULL,
  name        TEXT,
  last_seen_at INTEGER        -- Unix 毫秒时间戳
);

-- 推文表
CREATE TABLE tweets (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id),
  text         TEXT NOT NULL,
  created_at   TEXT,          -- ISO 8601
  lang         TEXT,
  entities_json TEXT,         -- 原始 entities JSON
  raw_json      TEXT          -- 完整推文 JSON
);

-- 增量拉取游标
CREATE TABLE user_latest (
  user_id      TEXT PRIMARY KEY,
  last_tweet_id TEXT
);

-- 索引
CREATE INDEX idx_tweets_user_created ON tweets(user_id, created_at DESC);
CREATE INDEX idx_tweets_created      ON tweets(created_at DESC);
```

---

## 环境变量

| 变量 | 说明 |
|------|------|
| `X_BEARER_TOKEN` | App-only 认证 Token |
| `X_API_KEY` | OAuth 1.0a App Key |
| `X_API_SECRET` | OAuth 1.0a App Secret |
| `X_ACCESS_TOKEN` | OAuth 1.0a Access Token |
| `X_ACCESS_SECRET` | OAuth 1.0a Access Secret |
| `HTTP_PROXY` / `HTTPS_PROXY` | 代理地址（可代替 config.json 中的 proxy 字段） |
| `LOG_LEVEL` | Pino 日志级别（默认 `info`） |
| `API_PORT` | API 服务端口（默认 `3081`） |
