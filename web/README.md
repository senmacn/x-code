# 前端 (web/)

Next.js 14 Web 界面，通过 REST API 与后端通信，提供推文浏览、用户管理、数据分析与配置等功能。

## 目录结构

```
web/
├── app/                       Next.js App Router 页面
│   ├── layout.tsx             根布局（侧边栏 + 主内容区）
│   ├── page.tsx               根路由重定向至 /dashboard
│   ├── dashboard/page.tsx     仪表盘
│   ├── tweets/page.tsx        推文管理
│   ├── users/page.tsx         用户管理
│   ├── analytics/page.tsx     数据分析
│   └── settings/page.tsx      设置
├── components/
│   ├── layout/
│   │   ├── Sidebar.tsx        左侧导航栏
│   │   └── TopBar.tsx         顶部栏（标题 + 立即拉取按钮 + 状态指示）
│   ├── dashboard/
│   │   ├── StatsCards.tsx     统计卡片（总推文 / 今日新增 / 用户数 / 上次拉取）
│   │   └── FetchStatus.tsx    调度器状态横幅
│   └── tweets/
│       ├── TweetCard.tsx      推文卡片（高亮 @mention / #hashtag）
│       └── FilterBar.tsx      筛选栏（搜索 / 用户 / 日期范围）
├── lib/
│   ├── api.ts                 API 客户端（封装所有 fetch 调用）
│   ├── types.ts               共享类型定义
│   └── utils.ts               cn() / relativeTime() / absoluteTime()
├── next.config.js             API 代理配置（/api/* → 127.0.0.1:3001）
├── tailwind.config.ts         Tailwind 配置
└── package.json
```

---

## 页面说明

### 仪表盘 `/dashboard`
- **上方**：4 张统计卡片（推文总数、今日新增、监控用户数、上次拉取时间）
- **调度状态栏**：当前运行状态、上次结果、cron 表达式
- **下方**：最新 20 条推文动态，每 30 秒自动刷新

### 推文管理 `/tweets`
- 全量推文列表，每页 30 条分页
- 筛选：用户下拉、关键词搜索、起止日期选择
- 推文卡片展示头像、用户名、发布时间（hover 显示绝对时间）、正文、语言标签
- 跳转原文链接

### 用户管理 `/users`
- 监控用户列表，显示推文计数与最近活跃时间
- **静态模式**：支持添加 / 删除用户（实时写入 config.json）
- **动态模式**：只读，提示由关注列表自动同步
- 跳转 X 主页链接

### 数据分析 `/analytics`
- **每日推文趋势**：柱状图，支持切换 7 / 14 / 30 / 90 天范围
- **用户发帖排行**：横向进度条排行榜，前 10 名

### 设置 `/settings`
- 工作模式切换（静态 / 动态）
- 拉取频率：预设快捷按钮 + 自定义 Cron 表达式
- 每用户最多条数 / 并发数（滑块）
- 代理地址输入
- 保存后立即生效（schedule 变更时后端自动重启 cron）

---

## 开发

```bash
# 单独启动前端（需后端已运行在 3001）
npm run dev

# 推荐：从项目根目录一键启动前后端
npm run dev:all   # 在根目录执行
```

前端访问地址：`http://localhost:3000`

### API 代理

开发环境下，`/api/*` 请求由 Next.js 自动代理到 `http://127.0.0.1:3001`，无需跨域配置。配置位于 `next.config.js`：

```js
rewrites: [{ source: "/api/:path*", destination: "http://127.0.0.1:3001/api/:path*" }]
```

### 数据刷新策略

| 数据 | 刷新间隔 |
|------|---------|
| 调度器状态 | 10 秒 |
| 统计卡片 | 30 秒 |
| 推文列表 | 手动操作触发 |
| 用户列表 | 60 秒 |

---

## 技术栈

| 库 | 用途 |
|----|------|
| Next.js 14 | App Router、SSR、开发代理 |
| Tailwind CSS | 样式 |
| SWR | 数据请求与缓存 |
| Recharts | 数据可视化图表 |
| lucide-react | 图标 |
| date-fns | 时间格式化 |
| clsx + tailwind-merge | 条件样式合并 |

---

## 构建

```bash
npm run build     # 构建 Next.js 应用
```

生产环境下，Express 后端会直接托管 `web/out/` 静态产物（如使用 `next export`）。
