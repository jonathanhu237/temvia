# 在线用户验收记录

日期：2026-09-09。源码在本地修改并单向同步；以下最终验证在 Centaurus 执行。

## 真实浏览器

连接隔离的真实 API、PostgreSQL、Redis，使用 Chromium，不 mock 登录、状态检查或撤销接口。

| 验收流程 | 结果 |
| --- | --- |
| 普通管理员查看两个目标会话、搜索、取消后确认踢超级管理员、双页面失效提示、重新登录 | 通过 |
| 只读用户可以查看但不能踢人；无读取权限用户直接访问被拒绝且不请求在线数据 | 通过 |
| 中文在线页面和自退确认，取消后重新确认，两个上下文均退出 | 通过 |
| 45 秒空闲期限，页面经历成功的后台检查/列表刷新后仍退出 | 通过 |

前三项执行 `bash .scratch/online-users/verify-browser.sh normal`：3 passed，约 1.1 分钟。

空闲用例使用 `E2E_ONLINE_USERS=1 E2E_ONLINE_IDLE_TIMEOUT_MS=45000 PLAYWRIGHT_BASE_URL=http://127.0.0.1:36173 node node_modules/@playwright/test/cli.js test e2e/online-users.spec.ts --project=chromium --grep 'background checks' --workers=1 --reporter=line`：1 passed，约 1 分钟。前置条件是隔离 API 的 `SESSION_IDLE_TIMEOUT=45s`；完成后恢复默认 30 分钟。已记录至少两次成功的状态检查和列表读取，证明不是在第一次轮询前就过期。

复跑脚本的 `idle` 模式会设置并恢复空闲配置。脚本需要先准备隔离验收账号及其角色；不得对开发数据运行夹具撤销操作。

## 前端与镜像

- `node node_modules/typescript/bin/tsc -b`：通过。
- `node node_modules/vitest/vitest.mjs run`：19 个文件、117 项测试全部通过。
- `node node_modules/vite/bin/vite.js build`：通过。
- `node node_modules/oxlint/bin/oxlint`：0 错误，1 条既有 TanStack Table / React Compiler 兼容性警告。
- `docker compose build api admin`：前后端生产镜像构建通过。

## HTTP、生成器和复核

第 1 轮发现的问题已修复，第 2 轮审查通过，见 `review.md`。

- `go test ./... -count=1`（不设置外部依赖测试环境变量）：9 个包通过。
- 配置隔离的 `TEST_POSTGRES_DSN`、`TEST_REDIS_ADDR`、`TEST_REDIS_PASSWORD` 后执行 `go test -p 1 ./internal/auth/adapter/httpapi ./internal/auth/adapter/postgres ./internal/auth/adapter/redis -count=1 -v`：三个包所有用例通过，无跳过。串行包执行避免已有 PostgreSQL/Redis 集成清理逻辑互相干扰。
- 其中新增真实 HTTP 集成 3/3 通过：全设备撤销/重新登录及日志、不续期、并发踢出与延迟旧会话写入。既有 Redis 绝对过期/并发删除和 PostgreSQL 生命周期测试也实际执行通过。
- 根目录 TypeScript 检查、构建通过；`node --test tests/cli.test.mjs tests/git.test.mjs tests/package.test.mjs`：19/19 通过，无跳过，包含真实 npm 打包和从包生成项目。
- `git diff --check`：通过。无 Git 提交。

## 开发服务

已执行 `docker compose up -d --no-deps api admin`。本地端口转发后的 `/health` 返回正常、在线页面返回 200、匿名在线查询和会话状态接口均返回 401。

访问地址：http://127.0.0.1:25173/online-users 。隔离的 acceptance 容器、数据卷及专用端口转发已清理。
