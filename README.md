# X Monitor

通过本地代理访问 X，定时拉取关注用户的最新发帖，支持 Web 界面与 CLI 两种使用方式。
当前版本已支持：
- 本地媒体缓存（图片/视频封面）与容量治理
- 任务状态持久化与失败重试（抓取/回填/清理）
- 引用推文结构化展示（不再只显示一串 X 链接）
- 用户头像自动同步与回填（`users.avatar_url`）
- 监控用户状态管理（active/paused/removed/blocked）与监控区间记录
- 推文采集状态标记（采集来源、采集时监控状态）
- 动态时间显示一键切换（相对时间 / 详细时间）
- 媒体大图弹窗预览（按需再跳转 X 原帖）

## 架构概览

```
┌─────────────────────────────────────────────────┐
│  前端 (web/)          Next.js 14 · 端口 3080     │
│  ─────────────────────────────────────────────  │
│  后端 (src/api/)      Express · 端口 3081        │
│    ├── REST API       推文 / 用户 / 分析 / 配置  │
│    └── 调度器         node-cron 定时拉取         │
│  ─────────────────────────────────────────────  │
│  数据层 (src/data/)   SQLite (data.db)           │
│  X 客户端 (src/clients/)  twitter-api-v2        │
└─────────────────────────────────────────────────┘
```

详细文档：[后端 →](src/README.md) · [前端 →](web/README.md)

---

## 快速开始

### 1. 安装依赖

```bash
nvm use            # 建议使用 .nvmrc 指定的 Node 版本
npm install
cd web && npm install && cd ..
```

> 若首次切换 Node 版本后后端启动报错（`better-sqlite3` 相关），执行：
> `npm rebuild better-sqlite3`

### 2. 配置环境变量

```bash
cp .env.example .env
# 填入 X API 授权信息（见下方「授权说明」）
```

### 3. 编辑配置

编辑 `config.default.json`，或复制为 `config.json`（优先级更高，不会被 git 追踪）：

```json
{
  "mode": "static",
  "staticUsernames": ["username1", "username2"],
  "priorityUsernames": ["username1"],
  "schedule": "*/15 * * * *",
  "proxy": "http://127.0.0.1:7890",
  "maxPerUser": 20,
  "concurrency": 3,
  "mediaCache": {
    "enabled": true,
    "rootDir": "media-cache",
    "cacheForPriorityOnly": true,
    "includeVideoFiles": false,
    "requestTimeoutMs": 12000,
    "maxDiskUsage": 2048,
    "ttlDays": 30,
    "cleanupCron": "0 * * * *"
  }
}
```

### 4. 启动

**Web 模式（推荐）**

```bash
npm run dev:all        # 同时启动后端 API + 前端界面
```

访问 `http://localhost:3080` 打开 Web 界面。

**纯 CLI 模式**

```bash
npm run dev            # 启动定时拉取守护进程
npm run fetch-once     # 立即拉取一次
npx ts-node src/cli/index.ts backfill-media --users tzwqbest --force --limit 500
npm run show -- --user jack --limit 20   # 终端查看推文
```

---

## 配置项

| 字段 | 类型 | 说明 |
|------|------|------|
| `mode` | `static` \| `dynamic` | 静态：手动维护用户名；动态：自动同步关注列表（需 OAuth，失败时回退到 staticUsernames） |
| `staticUsernames` | `string[]` | 静态模式下的用户名列表 |
| `priorityUsernames` | `string[]` | 媒体优先缓存用户（可与 staticUsernames 组合） |
| `schedule` | `string` | Cron 表达式，如 `*/15 * * * *` |
| `proxy` | `string` | 代理地址，也可通过 `HTTP_PROXY` / `HTTPS_PROXY` 环境变量设置 |
| `maxPerUser` | `number` | 每次每用户最多拉取的推文条数 |
| `concurrency` | `number` | 并发拉取的用户数（1–10） |
| `mediaCache.enabled` | `boolean` | 是否启用媒体本地缓存 |
| `mediaCache.rootDir` | `string` | 媒体缓存目录（限制在项目目录内） |
| `mediaCache.cacheForPriorityOnly` | `boolean` | 是否仅缓存 priorityUsernames |
| `mediaCache.includeVideoFiles` | `boolean` | 是否下载视频原文件（默认仅封面） |
| `mediaCache.requestTimeoutMs` | `number` | 媒体下载超时 |
| `mediaCache.maxDiskUsage` | `number` | 缓存总容量上限（MB） |
| `mediaCache.ttlDays` | `number` | 缓存过期天数 |
| `mediaCache.cleanupCron` | `string` | 缓存清理任务 cron 表达式 |

---

## 授权说明

| 场景 | 所需凭据 |
|------|---------|
| 读取用户资料/推文（`userByUsername` / `userTimeline`） | 优先 `X_BEARER_TOKEN`（App-only） |
| 动态获取关注列表（`v2.me` / `v2.following`） | `X_API_KEY` + `X_API_SECRET` + `X_ACCESS_TOKEN` + `X_ACCESS_SECRET`（OAuth 1.0a） |

认证策略：

- 读取接口默认优先使用 Bearer，降低 OAuth 凭据混用导致的 403 风险
- 若未设置 Bearer，读取接口会回退到 OAuth1.0a（需四项都存在）
- 动态关注列表接口强制使用 OAuth1.0a；失败时会回退到 `staticUsernames`
- 若凭据误填为 URL 编码形式（如 `%2B`、`%3D`），服务会自动尝试解码后再鉴权
- 若读取接口出现 `401 Unauthorized`，会自动切换到 OAuth1.0a 备用认证重试

常见 403 排查（示例错误：`must use keys and tokens ... attached to a Project`）：

1. 确认当前 App 已绑定到 X Developer Project
2. 确认 `API Key/API Secret/Access Token/Access Secret` 来自同一个 App
3. 更新 `.env` 后重启进程（旧进程不会自动刷新环境变量）

---

## 数据存储

- 本地 SQLite 文件 `data.db`，不进入 git 追踪
- 推文以 `tweet.id` upsert（支持后续字段补全/回填）
- 媒体资产采用去重存储：`media_assets` + `tweet_media`
- 引用关系采用结构化存储：`tweet_refs` + `ref_tweets`
- 任务状态持久化：`task_runs`（进度、重试、heartbeat）
- 用户限流冷却持久化：`user_rate_limits`
- 用户头像持久化：`users.avatar_url`
- 用户监控状态：`users.monitor_status` / `users.monitoring_started_at` / `users.monitoring_ended_at`
- 用户监控区间：`user_monitor_periods`
- 推文采集状态：`tweets.ingest_source` / `tweets.captured_at` / `tweets.monitor_status_at_capture`

---

## 注意

- 接口返回 429（限流）时会写入 `user_rate_limits`，重启后仍保持冷却窗口
- `/api/status` 会返回抓取/回填/清理状态以及 `taskRuns` 任务状态
- 推文中的 X 链接会在前端优先展示为“引用卡片”（可用/不可用两种状态）
- 静态模式下新增用户时，会立即尝试拉取用户资料并写入头像 URL
- 静态模式下“停止监控”不会删除历史推文，仅移出当前抓取目标并将用户状态标记为 `removed`
- 推文列表默认只展示当前监控中用户，可在页面勾选“包含历史已移除用户”切换到全历史口径
- 用户管理页面支持按状态/重点/关键词筛选，列表内直接进行“停止/继续监控”和重点用户切换
- 推文管理页面已按“筛选区-结果区-分页区”分层，降低信息噪声并提升浏览效率
- 仪表盘中的推文时间可点击统一切换展示格式（相对时间/详细时间）
- 推文媒体点击后先在弹窗中预览，弹窗内可选择跳转至 X 原帖
- `config.json` 不进入 git 追踪，适合存放本地个性化配置；`config.default.json` 作为模板随仓库保存
