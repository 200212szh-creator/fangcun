# 方寸 · Fangcun Archive

`方寸` 是一个本地优先的中英双语藏书与论文资料管理 PWA。它把“找到准确版本”放在入库之前，适合管理纸质书的实体副本、分类、标签、层级书架位置和阅读状态；论文只保存书目信息与合法开放获取链接，不托管受版权保护全文。

## 品牌

- 中文：方寸之间，万卷有序
- English: A world of books, perfectly in order.
- Deutsch: Eine Welt voller Bücher, wohlgeordnet

品牌名称、元数据、图标无障碍标签与进入页文案统一由 `lib/brand.ts` 提供。进入页始终同时展示三种语言；界面操作仍可在中文和 English 之间切换。

## Windows 一键启动

日常运行使用已安装的“方寸”桌面快捷方式。Windows 登录后，`Fangcun Archive Service` 任务会自动在后台启动；快捷方式会先检查服务健康状态，再打开 <http://localhost:3000>。

首次部署或更换账户时，以管理员身份在本目录打开 PowerShell，运行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-fangcun.ps1 -ProjectRoot 'D:\图书库' -DataRoot 'D:\方寸数据'
```

开发调试仍可先运行 `npm install`、复制 `.env.example` 为 `.env.local`，再使用 `npm run dev`；这不应替代日常常驻服务。

首次打开会进入品牌入口。勾选“下次直接进入”后，根路径会跳转到 `/home`；`/add`、`/search` 等深链接仍会直接打开目标页面。设置页可以再次查看入口。

面向日常使用的简明步骤见 [使用说明](docs/使用说明.md)。

## 常用命令

- `npm run db:init`：只创建 SQLite 表结构，不写入任何演示数据。
- `npm run db:seed`：已禁用，避免虚拟内容污染真实藏书。
- `npm run db:backup` / `npm run db:restore`：开发模式下的数据库脚本；正式运行请使用固定数据目录维护脚本。
- `npm run runtime:backup`：对固定数据目录执行一次完整性校验并生成每日备份。
- `npm run runtime:release` / `npm run runtime:install`：构建 standalone 发布版本或安装 Windows 常驻任务。
- `npm run db:migrate` / `npm run db:migrate:rollback` / `npm run db:validate`：执行、回滚并校验结构迁移。
- `npm run typecheck` / `npm run lint`：严格类型与代码规范。
- `npm test`：ISBN、标题标准化、匹配排序、来源合并、去重、缓存、翻译键和隔离 SQLite 集成测试。
- `npm run test:e2e`：Playwright 核心流程与响应式测试；首次使用需执行 `npx playwright install chromium`。
- `npm run build && npm start`：生产构建与本地生产运行。

## 功能地图

- 进入页：三语品牌入口、无远程视频的抽象书架视觉、语言切换、下次直接进入偏好。
- 首页：真实数据库统计、最近入藏、来自数据库的书架位置与计算数量；空库不展示虚构内容。
- 我的藏书：全文搜索、阅读状态筛选、网格 / 列表、批量软删除、详情编辑。
- 版本与副本：一本作品可保存多个版本和多册实体，记录版次、出版信息、来源、购入价格、品相、题记及结构化书架坐标。
- 借阅与批注：借出、归还、续借、逾期提示、借阅历史；按页码或章节记录批注，并用概念标签跨书检索。
- 书架与书标：可排序、停用和安全删除书架位置；书架地图只展示真实坐标，详情页可下载不含隐私数据的 QR 书标 PNG / SVG。
- 添加图书：按书名取消过期请求的联网匹配、ISBN、手动录入；多版本确认后入库；重复 ISBN 会提示新增另一册。
- 统一检索：图书 / 论文 / 全部切换；图书加入心愿单，论文保存到资料夹。
- 分类与位置：用户作用域分类、标签、房间 / 书柜 / 层级位置；首页可从空状态创建第一个位置。
- 数据：CSV 预览与提交、CSV / JSON 导出；导出的 JSON 是未来云端迁移的基础。

## API 与数据边界

实现了 `/api/discovery/books`、`/api/discovery/books/:candidateId/editions`、`/api/discovery/isbn/:isbn`、`/api/discovery/search`、`/api/discovery/related`、`/api/catalog/books`、`/api/catalog/books/:copyId`、`/api/catalog/books/from-edition`、心愿单、资料夹、分类、书架、导入预览 / 提交和 `/api/export`。外部图书来源为 Google Books 与 Open Library，论文来源为 Crossref；缓存降低重复请求。Google Books 出现 429 时会短暂冷却，由 Open Library 继续尝试；所有外部来源失败时返回空结果，不伪造书目。

UI 使用 Next.js App Router、TypeScript strict、Tailwind、Lucide、next-intl、TanStack Query、React Hook Form、Zod。服务端用 Drizzle ORM + SQLite，repository adapter 与 UI 解耦；所有实体 UUID、UTC 时间，当前本地 userId 固定为 `local-owner`。

开发模式下 SQLite 数据库默认位于 `data/library.db`；正式运行时真实数据库位于 `D:\方寸数据\data\library.db`，由 `FANGCUN_DATA_DIR` 和 `DATABASE_URL` 固定指向。迁移到 Supabase PostgreSQL 时，可保留现有 UUID 与 `userId`，将 repository adapter 换为 PostgreSQL 实现，再接入邮箱魔法链接与 RLS；首版不引入登录、同步冲突、阅读进度日志、PDF 附件或全文抓取。

## 性能与设计系统

持久化设计系统在 `design-system/default/MASTER.md`，入口覆写规则在 `design-system/default/pages/entry.md`，首页覆写规则在 `design-system/default/pages/home.md`。`/`、`/home`、`/add` 与 `/search` 采用独立路由入口；首页不会自动发起联网发现请求。仅预加载 Instrument Serif 与 Plus Jakarta 的本地字体文件，中文优先使用系统字体栈，且使用 `font-display: swap`，不会暴露 `assets/fonts-source` 为运行时静态路径。

## 备份与恢复

在设置页导出 JSON 或 CSV，也可以进入导入页先预览 CSV 再提交。正式运行时请使用 `runtime/maintenance/database-maintenance.js` 生成经过完整性校验的每日备份；恢复请使用 `runtime/maintenance/restore-database.js`，流程和固定目录见 [运行维护说明](docs/运行维护说明.md)。
