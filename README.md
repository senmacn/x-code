# X Monitor

通过本地代理访问 X，定时拉取关注用户的最新发帖，支持 Web 界面与 CLI 两种使用方式。

## 架构概览

```
┌─────────────────────────────────────────────────┐
│  前端 (web/)          Next.js 14 · 端口 3000     │
│  ─────────────────────────────────────────────  │
│  后端 (src/api/)      Express · 端口 3001        │
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
npm install
cd web && npm install && cd ..
```

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
  "schedule": "*/15 * * * *",
  "proxy": "http://127.0.0.1:7890",
  "maxPerUser": 20,
  "concurrency": 3
}
```

### 4. 启动

**Web 模式（推荐）**

```bash
npm run dev:all        # 同时启动后端 API + 前端界面
```

访问 `http://localhost:3000` 打开 Web 界面。

**纯 CLI 模式**

```bash
npm run dev            # 启动定时拉取守护进程
npm run fetch-once     # 立即拉取一次
npm run show -- --user jack --limit 20   # 终端查看推文
```

---

## 配置项

| 字段 | 类型 | 说明 |
|------|------|------|
| `mode` | `static` \| `dynamic` | 静态：手动维护用户名；动态：自动同步关注列表（需 OAuth） |
| `staticUsernames` | `string[]` | 静态模式下的用户名列表 |
| `schedule` | `string` | Cron 表达式，如 `*/15 * * * *` |
| `proxy` | `string` | 代理地址，也可通过 `HTTP_PROXY` / `HTTPS_PROXY` 环境变量设置 |
| `maxPerUser` | `number` | 每次每用户最多拉取的推文条数 |
| `concurrency` | `number` | 并发拉取的用户数（1–10） |

---

## 授权说明

| 场景 | 所需凭据 |
|------|---------|
| 仅读取静态用户推文 | `X_BEARER_TOKEN`（App-only） |
| 动态获取关注列表 | `X_API_KEY` + `X_API_SECRET` + `X_ACCESS_TOKEN` + `X_ACCESS_SECRET`（OAuth 1.0a） |

缺少授权时会自动回退到 `staticUsernames`，日志中会有提示。

---

## 数据存储

- 本地 SQLite 文件 `data.db`，不进入 git 追踪
- 推文以 `tweet.id` 去重，重复写入安全
- 索引：`(user_id, created_at)` + `created_at`

---

## 注意

- 接口返回 429（限流）或权限错误时，日志会提示并跳过该用户，不影响其他用户继续拉取
- `config.json` 不进入 git 追踪，适合存放本地个性化配置；`config.default.json` 作为模板随仓库保存
