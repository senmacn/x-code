# X Fetcher (TypeScript)

一个通过本地代理访问 X，定时拉取你关注用户最新发帖的 TypeScript 项目，并支持在终端中读取与展示内容。

## 快速开始

1. 安装依赖：`npm install`
2. 复制环境示例：`cp .env.example .env` 并填入授权与代理（可选）
3. 配置关注策略：编辑 `config.json` 或使用默认的 `config.default.json`
4. 开发运行：`npm run dev`（首次会立即拉取并按配置定时执行）
5. 生产构建与启动：`npm run build && npm run start`

## 命令

- `npm run dev`：开发模式启动（`ts-node`），立即拉取并按 `schedule` 定时执行
- `npm run fetch-once`：立即拉取一次
- `npm run show`：在终端读取并显示已存储推文
  - 过滤：`--user <username>`、`--since <ISO>`、`--until <ISO>`、`--contains <keyword>`、`--lang <code>`、`--limit <n>`
  - 列出用户：`--users`（显示当前跟踪的用户列表）
  - JSON 输出：`--json`（以 JSON 行输出便于导出或二次处理）

示例：

```bash
npm run show -- --user jack --limit 10
# 按时间范围与关键字筛选
npm run show -- --since 2024-01-01T00:00:00Z --until 2024-12-31T23:59:59Z --contains "beta"
# 列出已跟踪的用户
npm run show -- --users
# 导出为 JSON 行
npm run show -- --user jack --limit 50 --json > jack.jsonl
```

## 配置说明（`config.json` 或 `config.default.json`）

- `mode`: `static` 或 `dynamic`（动态模式需要用户授权以获取关注列表）
- `staticUsernames`: 静态用户名数组（`static` 模式下有效）
- `schedule`: cron 表达式（如 `*/10 * * * *` 表示每 10 分钟）
- `proxy`: 代理地址（如 `http://127.0.0.1:7890`），也可通过环境变量 `HTTP_PROXY`/`HTTPS_PROXY`
- `maxPerUser`: 每次拉取每用户检查的最近推文数
- `concurrency`: 预留并发参数（当前串行执行，后续可扩展）

## 授权说明

- 动态关注列表需要用户上下文（OAuth1.0a）提供 `X_API_KEY` 等；
- 仅使用公开读取可尝试 `X_BEARER_TOKEN`，但接口可用性取决于 X 的当前策略；
- 如果缺少授权，项目将回退到 `staticUsernames`。

## 存储

- 本地 SQLite（`data.db`）存储用户与推文，去重以 `tweet.id` 为键；
- 可通过 `npm run show` 在终端快速查看保存的内容，支持用户名、时间范围、语言与关键字筛选；
- 已添加索引：`(user_id, created_at)` 与 `created_at`，查询更高效。

## 代理

- 支持从配置或环境变量读取代理，所有请求将通过该代理发送。

## 注意

- 若调用接口返回 429（限流）或权限错误，日志会提示并跳过该用户；
- 如需更强的终端交互（TUI），可以在后续迭代中加入。