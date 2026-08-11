# AI Agent Quota Dashboard 产品与技术 Brief

更新时间：2026-08-11
当前阶段：v0.1 developer preview / 真实数据 dogfooding。核心 MVP 已经从构思进入可运行实现：本地 Web Dashboard、Doctor、Settings、Codex/Claude Code 真实额度来源、桌面托盘小面板、桌面置顶小组件、严格 readiness 检查和中英双语 UI 都已落地。下一步重点是发布前体验打磨，而不是扩展大量 provider。

当前状态总览见：[docs/status.md](status.md)。

## 0. 当前实现快照

已实现：

- TypeScript/Node 本地服务，默认绑定 `127.0.0.1`
- SQLite 存储 quota snapshots、reset events、refresh runs
- Codex：优先自动读取本地 CLI `rate_limits` 结构化事件；没有可靠自动来源时，保留显式手动兜底
- Claude Code：通过官方 statusline `rate_limits` 写入本地 sanitized snapshot
- Dashboard / Doctor / Settings / Refresh History / Export
- 桌面托盘 mini panel 和 always-on-top widget
- 主 dashboard 与 mini surfaces 的中英双语切换
- `trial:preflight` / `trial:ready` 严格真实数据检查
- Windows + Ubuntu GitHub Actions CI

仍需在公开宣传前完成：

- 新手初次配置文案继续压缩和跨系统适配
- 完整 fresh-machine 真实数据试跑
- 截图/GIF 和 README 发布说明
- 首版分发方式已明确：source-only developer preview；桌面打包后续再做

## 1. 一句话定位

做一个 **local-first、quota-first、小而美** 的 AI coding agent 额度仪表盘：

> 打开一眼就知道：Codex、Claude Code 等 agent 还剩多少额度，什么时候恢复，哪个工具快用完了，数据来源有多可靠。

不要一开始定位为“万能监控所有 AI 产品 token 的工具”。更好的定位是：

> A local-first quota dashboard for AI coding agents, showing what is left, when it resets, and how confident the source is.

中文产品描述可以是：

> 一个本地优先的 AI Agent 额度看板，统一显示 Codex、Claude Code 等 coding agent 的剩余额度、重置时间和数据可信度。

## 2. 核心结论

这个产品技术上可以做，但要把边界切干净。

最稳的方向不是破解或爬取外部 AI 产品，而是聚合用户本机已经可见或官方允许访问的使用额度信息：

- 官方 CLI 输出
- 本地 session/log 文件
- Claude Code statusline / rate_limits
- Codex session 中的 quota snapshot
- 官方 API / OAuth / Admin API
- 用户主动导入的 CSV/账单
- 必要时读取页面上明确展示的 quota 信息，但必须标记为 estimated 或 visible_ui

需要避免：

- 收集用户密码
- 抓 session cookie
- 模拟登录
- 调用未公开内部接口
- 绕过 rate limit
- 自动切换账号规避额度
- 上传 prompt、response、源代码、聊天内容

从难度看，政策/授权/数据来源大约占 70%，技术实现约占 30%。真正的问题不是“能不能写代码抓到”，而是“能不能持续、合法、稳定地获得数据”。

## 3. 为什么 MVP 应该小范围开始

一开始只 focus 几个好做的 agent 是正确切法。

不要做：

- 支持所有 AI 产品
- 支持几十个 provider
- 做复杂团队管理
- 做浏览器 cookie 自动读取
- 做多设备同步
- 做完整成本优化平台

建议 MVP 只做：

- Claude Code
- Codex
- 本地日志读取
- statusline / 本地 quota snapshot
- SQLite 本地缓存
- Web dashboard
- 低额度提醒
- 数据来源可信度标签
- doctor 诊断页面

原因：

- Claude Code 和 Codex 都是 agent-heavy、高频消耗、额度焦虑明显的场景
- 两者更容易从本地文件、statusline 或 CLI 状态中拿到数据
- 用户价值非常直接：“我今天/这周还能不能继续跑任务”
- 先验证产品价值，再扩展 Cursor、Gemini CLI、Copilot 等

建议路线：

```text
MVP: Claude Code + Codex
v0.2: Gemini CLI / Cursor 本地数据
v0.3: Cursor Teams/Admin API
v0.4: GitHub Copilot org metrics
v0.5: 浏览器插件读取网页可见 quota，但只做 opt-in
```

## 4. 产品形态建议

第一版推荐：

```text
本地后台服务 + localhost Web Dashboard
```

原因：

- 跨平台比原生菜单栏快
- UI 可以做得精致
- 本地优先，信任感强
- 已经可以把同一套 local API 接到 Electron tray mini panel 和桌面置顶 widget
- 后续再补打包、签名、自动启动和原生平台 polish

当前/后续形态：

- localhost Web Dashboard：已实现
- Electron tray mini panel / always-on-top widget：已实现开发壳
- CLI command / Doctor / export：已实现
- local JSON/CSV export：已实现
- macOS menu bar 原生 polish：后续
- VS Code sidebar：后续

## 5. 第一屏 UI 原则

第一屏只回答 3 个问题：

1. 我每个 agent 还剩多少？
2. 什么时候 reset？
3. 哪个 agent 最危险？

示例：

```text
Codex         72% left    resets in 2h 14m    official
Claude Code  41% left    weekly resets in 4d local_log
Gemini CLI   no data     not used today      unavailable
```

每个 agent 一张小卡：

- agent 图标
- 剩余额度百分比 / 数值
- reset 倒计时
- 数据来源标签：official / local_log / estimated / stale / manual
- 最后更新时间
- 轻量趋势线
- 低额度状态色

点击卡片进入详情：

- 5h / daily / weekly window
- 当前 session 用量
- 最近 24h 消耗速度
- 预计是否会在 reset 前耗尽
- 最近 sessions
- token/cost breakdown
- 数据来源说明和可信度

视觉方向：

- 安静、克制、工具感
- 不做满屏复杂图表
- 不做营销 landing page
- 不做过度装饰
- 默认突出剩余额度和 reset countdown
- 成本分析藏在详情里，不压迫第一屏

## 6. 关键数据模型

建议内部统一成 quota snapshot，而不是只记录 token。

```ts
type QuotaSnapshot = {
  provider: "openai" | "anthropic" | "google" | "cursor" | string;
  agent: "codex" | "claude-code" | "gemini-cli" | "cursor" | string;
  accountIdHash?: string;
  planLabel?: string;

  windowType: "session_5h" | "daily" | "weekly" | "monthly" | "billing_cycle" | "credits";
  unit: "tokens" | "messages" | "credits" | "usd" | "percent" | "requests";

  used?: number;
  remaining?: number;
  total?: number;
  usedPercent?: number;
  remainingPercent?: number;

  resetAt?: string;
  observedAt: string;
  expiresAt?: string;

  source: "official_api" | "cli_status" | "statusline" | "local_log" | "visible_ui" | "manual";
  confidence: "official" | "high" | "medium" | "estimated" | "unknown";
  stale: boolean;

  rawSourceRef?: string;
};
```

还需要 usage event：

```ts
type UsageEvent = {
  provider: string;
  agent: string;
  sessionId?: string;
  projectPathHash?: string;
  model?: string;

  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  reasoningTokens?: number;
  totalTokens?: number;

  costUsdEstimate?: number;
  observedAt: string;
  sourceFile?: string;
  source: "local_log" | "official_api" | "cli_status";
};
```

## 7. 数据可信度设计

一定要公开标注数据来源，不能把估算伪装成官方。

建议标签：

- `official`: 来自官方 API、CLI status、Claude statusline rate_limits 等
- `local_log`: 从本地 session/log 解析得出
- `estimated`: 从日志、历史、快照推算，可能过期或不完整
- `stale`: 数据太久没更新
- `manual`: 用户手动输入或导入
- `unavailable`: 没检测到来源

UI 文案示例：

```text
Estimated from local Codex session snapshots. May be stale until Codex refreshes quota data.
```

```text
Official rate limit data captured from Claude Code statusline.
```

## 8. 架构建议

推荐分层：

```text
Local Agent Scanner
  -> Provider Adapters
  -> Normalizer
  -> SQLite Snapshot Store
  -> Local API
  -> Web Dashboard
  -> Notification/Alert Engine
```

更具体：

```text
adapters/
  claude-code/
    discover.ts
    parse-logs.ts
    read-statusline.ts
    normalize.ts
  codex/
    discover.ts
    parse-sessions.ts
    parse-quota.ts
    normalize.ts

core/
  quota-window.ts
  usage-event.ts
  source-confidence.ts
  pricing.ts
  sqlite-store.ts
  retention.ts

api/
  GET /api/agents
  GET /api/quota
  GET /api/quota/history
  GET /api/usage
  GET /api/doctor
  POST /api/refresh

ui/
  dashboard
  agent detail
  doctor
  settings
```

核心原则：

- 每个 provider 独立 adapter
- adapter 只负责发现、读取、解析、映射
- core 负责统一数据模型、聚合、窗口计算、可信度
- UI 不直接读本地文件
- 所有外部/本地权限都显式 opt-in
- 默认 localhost-only

## 9. Doctor 页面非常重要

Doctor 页面可以建立信任，也减少用户支持成本。

示例：

```text
Claude Code
Detected: yes
Usage logs: found
Quota source: statusline
Last update: 2 min ago
Confidence: official

Codex
Detected: yes
Usage logs: found
Quota source: local session snapshot
Last update: 18 min ago
Confidence: estimated

Gemini CLI
Detected: no
Suggested path: ~/.gemini
```

Doctor 应检查：

- agent 是否安装
- 默认数据路径是否存在
- 是否能读取 session 文件
- 最近是否有活动
- 是否找到 quota 信息
- 数据是否 stale
- 是否需要用户启用 statusline/hook
- 是否需要用户调整 session retention
- 本地服务端口是否正常

## 10. 告警与预测

第一版只做简单告警即可：

- 5h window 剩余低于 20%
- weekly 剩余低于 20%
- 数据超过 N 小时未更新
- reset 前预计会耗尽

告警形式：

- Dashboard 内醒目状态
- 系统通知，后续再做
- 邮件/Slack 暂时不做，企业版再加

v0.2 可以加入 **Reset Rhythm / 重置节奏** 统计。这个功能基于已经保存的 reset events，回答用户常见的真实问题：为什么睡醒以后 Codex 又回到了 100%，最近到底多久恢复一次。

建议展示：

- 最近 N 次观测到的 reset / replenishment 时间
- 相邻两次 reset 之间的间隔
- 平均、中位数、最短、最长间隔
- 每次恢复前后的 remaining 变化，例如 `18% -> 100%`
- reset anchor changed 和 quota replenished 分开标记
- 明确文案：这些是本地观测，不是官方保证的未来重置计划

预测逻辑 MVP 可以很简单：

```text
burn_rate = recent_usage / recent_time
time_to_empty = remaining / burn_rate
if time_to_empty < time_until_reset:
  show "likely to run out before reset"
```

不要一开始做复杂 ML forecast。

## 11. 开源项目调研总结

### 11.1 CodexBar

GitHub: https://github.com/steipete/CodexBar

定位：

- macOS 菜单栏应用
- 显示多 provider 的 quota、reset、credits、spend、status
- 支持 Codex、OpenAI、Claude、Cursor、Gemini、Copilot、OpenRouter、LiteLLM 等大量 provider

技术栈：

- Swift / SwiftUI
- macOS 14+
- Swift Package
- Core + App + CLI + Widget
- Provider Descriptor + Fetch Strategy 架构

架构亮点：

- provider descriptor 是单一事实来源
- 每个 provider 有 fetch strategy pipeline
- 支持 CLI、OAuth、cookies、local files、API keys、web dashboard 等多种来源
- UI 和 CLI 共用 provider fetch pipeline
- 有 provider authoring guide

值得借鉴：

- Provider Descriptor / Fetch Strategy 抽象
- 每个 provider 显示 quota window + reset countdown
- stale/error 状态
- provider diagnosis/debug
- privacy-first 文案
- menu bar 作为未来形态

不建议 MVP 照搬：

- 过多 provider
- browser cookies
- web scraping
- Keychain/browser cookie 权限复杂度
- macOS-only 形态

### 11.2 Token Monitor

GitHub: https://github.com/Javis603/token-monitor

定位：

- Desktop widget
- 显示 28+ AI coding tools 的 token usage、AI tool limits、session detail
- 支持多设备同步

技术栈：

- Electron + Node.js
- electron-builder
- 使用 `tokscale` 作为底层解析依赖
- hub/agent 模式
- Cloudflare Worker 可做同步 backend

亮点：

- 本地优先
- 多设备同步
- 菜单栏 / tray / floating bubble
- 多账户、多 provider 限额视图
- usage trends、dashboard、export
- prompts/responses/source code 默认本地不上传

值得借鉴：

- 小 widget 产品形态
- 多设备同步作为未来增值功能
- 按 tool/device/model/session/project/account 维度 breakdown
- subscription records：记录用户实际订阅费用
- preserve deleted session usage：保存聚合快照，避免源日志被清理后历史丢失

不建议 MVP 照搬：

- 28+ provider 覆盖面
- Electron 体积
- 多设备同步复杂度
- cookie/API key connector

### 11.3 Tokdash

GitHub: https://github.com/JingbiaoMei/Tokdash

定位：

- 本地 token & cost dashboard
- 支持 Codex、Claude Code、Gemini CLI、Antigravity、OpenCode、Kimi 等
- 有 quota tab

技术栈：

- Python 3.10+
- FastAPI
- Uvicorn
- SQLite
- 本地 HTTP API

亮点：

- localhost-only 默认
- `tokdash setup` onboarding
- `tokdash doctor`
- 本地 SQLite index
- quota snapshots
- optional quota polling，需要用户 consent
- `/api/usage`、`/api/quota`、`/api/quota/history` 等本地 API
- 明确说明 cost accuracy 和 local logs retention

值得借鉴：

- 本地服务 + Web Dashboard 是我们 MVP 的最佳形态
- Doctor 命令
- setup wizard
- quota polling consent
- SQLite 持久化聚合结果
- 只保存快照，不保存敏感原文

### 11.4 ccusage

GitHub: https://github.com/ccusage/ccusage

定位：

- 多 coding agent CLI token/cost usage 报表
- 读取本地 usage data
- 支持 Claude Code、Codex、OpenCode、Gemini CLI、Copilot CLI 等

技术栈：

- Rust core
- npm launcher
- pnpm monorepo
- 每个 agent 一个 Rust adapter crate

亮点：

- 性能好
- 支持 daily/weekly/monthly/session report
- JSON output
- cost tracking
- cache token support
- custom pricing overrides
- offline pricing
- adapter 结构清晰

值得借鉴：

- 每个 agent 一个 adapter
- path discovery / parser / loader / report 分离
- 共享 aggregation 和 pricing
- JSON output 方便被其他 UI 消费
- Rust/Go 后续可作为高性能 scanner 方向

不足：

- 更偏 CLI 报表
- 不够 quota-first
- 不是小而美 GUI

### 11.5 tokscale

GitHub: https://github.com/junhoyeo/tokscale

定位：

- 高性能 CLI + TUI + visualization dashboard
- 跨多个 AI coding agents 追踪 token/cost

技术栈：

- Rust workspace
- TypeScript/npm package
- Ratatui TUI
- optional web visualization

亮点：

- 支持 agent 非常多
- Rust native core
- SIMD JSON parsing
- parallel file scanning
- LiteLLM pricing
- JSON export
- group-by model/client/session/workspace

值得借鉴：

- group-by 设计
- usage parser 覆盖经验
- LiteLLM pricing integration
- Rust 高性能扫描

不建议 MVP 照搬：

- 社交 leaderboard
- 功能范围太大
- TUI 不是目标用户最直观形态

### 11.6 Claude-Code-Usage-Monitor

GitHub: https://github.com/Maciek-roboblog/Claude-Code-Usage-Monitor

定位：

- Claude Code usage monitor
- terminal live monitor
- official statusline rate_limits
- forecasting
- local warehouse

技术栈：

- Python
- Rich
- Pydantic
- pytest/mypy/ruff

亮点：

- official-limit trust layer
- provenance labels：official / local_estimate / experimental / unknown
- machine-readable protocol：`--once --output json`、`--write-state`
- local warehouse
- automation-friendly exit codes
- timezone edge cases 覆盖

最值得借鉴：

- 数据可信度/provenance 设计
- 机器可读 snapshot
- state file 给外部 GUI/status bar 消费
- official data 优先，estimate fallback

### 11.7 token-tracker

GitHub: https://github.com/stormzhang/token-tracker

定位：

- 中文项目
- Claude Code + Codex 本地 token 追踪
- statusline + CLI dashboard
- 5h/7d 配额百分比 + reset countdown

技术栈：

- Python 3.11+
- Rich
- questionary

亮点：

- 刚好支持 Claude Code + Codex
- `tt setup` 配置状态栏
- Claude Code 官方 statusline
- Codex 伪 statusline
- GitHub 风格热力图
- 多主题
- 默认本地、不上传

值得借鉴：

- MVP 范围很接近我们
- 状态栏数据入口
- setup wizard
- 中文用户体验
- 报表命令和状态命令分离

需要谨慎：

- Codex hook/伪 statusline 要明确用户授权
- 不要让用户感觉在修改 agent 行为或注入内容

### 11.8 cursor-usage-tracker

GitHub: https://github.com/ofershap/cursor-usage-tracker

定位：

- Cursor Enterprise 团队成本监控
- 异常检测
- Slack/email alerts

技术栈：

- Next.js
- TypeScript
- SQLite via better-sqlite3
- Recharts
- Tailwind
- Docker

亮点：

- team overview
- per-user drilldown
- anomaly detection
- incident lifecycle
- Slack/email alerts
- settings page
- Docker self-host

值得借鉴：

- 后续团队版的 alert/incident 设计
- 阈值配置
- 低额度/异常花费提醒
- SQLite 可替换数据层

不适合 MVP：

- 依赖 Cursor Enterprise Admin API
- 偏企业
- 不是个人本地 quota-first 产品

## 12. 最值得整合进我们项目的设计

### 必须有

- Claude Code + Codex 先行
- local-first
- localhost-only dashboard
- SQLite 存聚合快照
- source confidence/provenance
- doctor 页面
- reset countdown
- low quota warning
- stale data 状态
- 不保存 prompt/response
- 不读取密码/cookie

### 应该有

- provider adapter 架构
- 一键 refresh
- JSON/CSV export
- setup wizard
- data retention notice
- pricing estimate 但默认弱化
- session list 但不展示原文
- 用量趋势小图

### 暂时不要

- 大量 provider
- browser extension
- browser cookie import
- multi-device sync
- team management
- Slack/email alert
- social/leaderboard
- 自动账号切换
- 自动登录

## 13. MVP 功能清单

当前已完成：

- Codex CLI `rate_limits` 自动检测和手动 visible-status 兜底
- Claude Code official statusline `rate_limits` 接入
- 读取/保存 quota snapshots
- Dashboard 首页
- Doctor 页面
- Settings 首次接入引导
- SQLite 本地存储
- 数据可信度标签
- 手动刷新
- stale 标记
- reset countdown
- low quota warning
- Refresh History
- JSON/CSV export
- Desktop tray mini panel
- Always-on-top widget
- 中英双语 UI

发布前继续打磨：

- 新手 onboarding 文案和跨系统终端指引
- fresh-machine 真实数据试跑
- 截图/GIF 和 README release 说明
- 打包/分发方式
- release checklist

v0.2 再考虑：

- system notification
- 简单趋势/预测
- Reset Rhythm：统计最近重置频率、间隔、恢复幅度，并把结果标为本地观测
- Agent detail 页面
- local API 文档
- macOS menu bar 原生 polish
- VS Code sidebar
- Gemini CLI
- Cursor local/enterprise connector
- multi-device sync

## 14. 可能的技术选型

### 方案 A：最快 MVP

```text
Next.js / React frontend
Node.js local server
better-sqlite3
chokidar
Recharts or lightweight chart lib
```

优点：

- 前后端统一 TypeScript
- UI 快
- 适合本地 dashboard
- 后续可以封装 Electron/Tauri

缺点：

- 打包成本比 Python CLI 高

### 方案 B：Python local service

```text
FastAPI
SQLite
static frontend
uv/pipx install
```

优点：

- 接近 Tokdash
- 解析脚本方便
- CLI 用户接受度高

缺点：

- 对普通非 Python 用户安装体验不如桌面 app

### 方案 C：Rust/Go scanner + Web UI

```text
Rust or Go scanner
SQLite
embedded static frontend
single binary
```

优点：

- 单二进制
- 性能好
- 安装体验好

缺点：

- UI 开发迭代比 TypeScript 慢

建议：

先用 **TypeScript/Node + local Web UI** 做 MVP，验证价值；如果扫描性能和安装体验成为问题，再把 scanner 抽成 Rust/Go。

## 15. 合规与隐私边界

产品文案应该明确：

```text
This app reads known local usage files and official quota outputs from tools you already use.
It does not collect prompts, responses, source code, passwords, or session cookies.
```

中文：

```text
本工具只读取你本机上已存在的使用统计、额度快照或官方状态输出。
不会收集 prompt、回复内容、源代码、密码或浏览器 session。
```

需要做：

- 默认本地运行
- 默认只绑定 127.0.0.1
- 明确列出读取路径
- 每个 connector 都有来源说明
- 每个网络请求都 opt-in
- 导出 quota 数据时提醒是否包含账户信息

不要做：

- 自动读取浏览器 cookie
- 自动模拟网页登录
- 未经同意扫描任意目录
- 把 prompt/response 上传到云
- 夸大“官方准确”

## 16. 建议的首页信息架构

```text
Top bar:
  AI Agent Quota
  Last refresh: just now
  Refresh button
  Settings button

Main:
  Critical agent card
  Agent cards grid

Card:
  Agent icon + name
  Remaining percentage
  Window label: 5h / weekly / daily
  Reset countdown
  Confidence badge
  Small sparkline

Below:
  Upcoming resets
  Recent usage
  Doctor summary
```

Agent detail：

```text
Header:
  Claude Code
  Plan/account label if available
  Last updated

Quota windows:
  5h session
  Weekly
  Model-specific if available

Usage:
  today
  last 7 days
  model breakdown
  session list

Source:
  where data came from
  confidence
  limitations
```

Doctor：

```text
Detected agents
Data paths
Last file update
Quota source
Permissions
Retention warnings
Troubleshooting actions
```

## 17. 推荐下一步

当前最值得做的不是继续加 provider，而是把已经能跑通的真实数据体验打磨到可以给早期用户试用：

1. 用一个全新目录从 `git clone` 开始跑完整 fresh-machine 试用
2. 验证 `npm install`、`npm test`、`npm run desktop:local`、`npm run trial:ready`
3. 记录新手在 Codex / Claude Code 初次接入时卡住的位置
4. 压缩 Settings 里的引导文案，只突出“现在做什么、复制哪里、结果是什么”
5. 为 Windows、macOS、Linux 分别确认终端命令和 Claude Code 打开方式
6. 准备 README 截图/GIF：主 dashboard、小面板、桌面 widget、Settings 首次接入
7. 第一版按 source-only developer preview 发布；zip artifact / Electron packaged build 后续再做
8. 更新 `CHANGELOG.md` release entry，按 `docs/release-checklist.md` 验证后打 tag
9. v0.2 再考虑低额度系统通知、Reset Rhythm 和简单趋势/预测
10. 只有当 Codex + Claude Code 体验足够可信后，再评估 Gemini CLI / Cursor

## 18. 给新窗口的启动 Prompt

可以把下面这段直接发给新窗口：

```text
我想继续开发 AI Agent Quota Dashboard。项目已经不是从零 scaffold 阶段，而是 v0.1 developer preview / 真实数据 dogfooding 阶段。

请先阅读 docs/status.md、docs/roadmap.md、README.md、CHANGELOG.md 和 docs/brief.md。当前已经实现 TypeScript/Node 本地服务、SQLite、Codex CLI rate_limits 自动检测、Claude Code statusline rate_limits、Dashboard/Doctor/Settings、Electron tray mini panel、always-on-top widget、严格 trial readiness 和中英双语 UI。

下一步请不要扩展新 provider，先围绕“早期用户能否顺利完成真实数据体验”继续打磨：检查文档是否最新，跑 npm test / desktop smoke / trial readiness，修复新手引导、跨系统命令、UI 文案、截图和 release checklist。隐私边界保持不变：不读 cookie、不模拟登录、不上传 prompt/response/source code、不调用隐藏接口。
```

## 19. 核心产品原则

- 小而美，不做臃肿 analytics
- 用户第一眼看到剩余额度和 reset 时间
- 官方数据优先，估算数据清楚标注
- 默认本地，默认隐私保护
- 不碰密码、cookie、隐藏接口
- 每个 provider 独立 adapter
- 先做 Claude Code + Codex
- 先验证真实痛点，再扩展 provider
