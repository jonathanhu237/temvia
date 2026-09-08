# 验收记录

- 前端 `pnpm check` 通过；`pnpm lint` 无错误，保留 1 条既有 TanStack Table warning。
- 前端 `pnpm test`：19 个文件、117 项测试通过。
- Centaurus 生产构建（TypeScript + Vite）通过。
- 根目录 `pnpm check && pnpm build && pnpm test && pnpm test:package` 通过：12 项 CLI 测试、2 项打包测试。
- Centaurus Chromium `e2e/online-users.spec.ts`：3 passed，1 skipped。验证双设备强制退出、取消、重新登录、只读/无权访问、中文及自身退出。此次未重复长时间 idle 流程；后端会话机制没有变更，该流程已在此前在线用户任务以 45 秒超时通过。
- Centaurus Chromium `browser-acceptance.mjs`：30 项检查通过。覆盖四类菜单权限组合、直接链接与访问控制，中英文七个后台页面的唯一主标题、重复主题清理、角色权限与历史标签，键盘展开与访问，390px 窄屏菜单和页面无横向溢出，以及五个认证路由的标题／重定向行为。
- 本地 `git diff --check` 通过。

## 真实浏览器复现

隔离服务使用 `.scratch/online-users/acceptance-env.sh` 启动，在 Centaurus 的 API 目录运行本目录 `seed.go` 创建测试账号。先运行在线用户 E2E 生成真实强制退出历史记录，然后从 `template/admin` 执行：

```sh
mise exec -- node ../../.scratch/admin-navigation-copy/browser-acceptance.mjs
```

脚本使用真实 Chromium、真实 API、PostgreSQL 和 Redis，不模拟认证或强制退出结果。测试夹具仅用于独立的 `online_acceptance` 数据库。

## 截图

- [中文在线用户桌面](artifacts/online-desktop-zh.png)
- [中文操作历史桌面](artifacts/history-desktop-zh.png)
- [中文窄屏导航](artifacts/monitoring-mobile-zh.png)
- [中文窄屏在线用户](artifacts/online-mobile-zh.png)

桌面与窄屏截图已人工检查。窄屏沿用既有表格横向滚动，未改变表格布局策略。

## Review

[第一轮直接审查](review.md)：Standards 0 findings；Spec 0 findings。

## 开发环境

Centaurus 执行 `docker compose build admin && docker compose up -d --no-deps admin` 成功。通过本地转发验证 API `/health` 为 `ok`，`http://127.0.0.1:25173/online-users` 提供本轮构建资源 `index-UoSabScJ.js`，未登录请求在线用户 API 返回 401。

验收结束后已删除独立验收容器、数据库卷和网络，开发环境服务保持运行。

## 用户验收后的居中修正

用户确认 LGTM 并要求提交推送，同时指出操作历史页面偏左。页面容器补充 `mx-auto w-full`，保留 `max-w-6xl`，使标题、筛选区和列表整体居中。

Centaurus 生产构建通过；`verify-centering.mjs` 在真实 Chromium 中验证 1920、1280、390px 三种宽度的页面中心与父容器中心偏差小于 1px，且没有页面横向溢出。已检查 [1920px 截图](artifacts/history-centered-1920.png)。
