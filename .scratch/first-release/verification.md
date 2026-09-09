# 首版发布验证记录

日期：2026-09-09。验证对象为当前未提交工作区；尚未绑定最终发布提交，也未公开发布。

## macOS 首次使用验收

- 使用真实 npm tarball，在仓库之外的全新目录安装生成器并生成项目；没有使用源码 CLI 代替安装产物。
- macOS + OrbStack，Docker Compose v5.1.2；Node.js 24.20.0，Go 与前端构建在生成项目的容器中运行。
- 填写独立的五项秘密配置，使用隔离的 Compose 项目、端口及 PostgreSQL 数据卷。
- `make build` 成功构建 API、Admin 和迁移镜像。
- `make migrate-up` 在全新数据库完成 7 项迁移，`make up` 启动成功，API 健康接口返回 `{"status":"ok"}`。
- 真实 Chrome 执行现有 auth E2E 的初始化、登录、会话恢复、主题、语言切换和退出流程：**1 passed，11.9 秒**。
- 检查包含可访问性检测、刷新后的会话恢复、中英文切换、移动端菜单、退出失败后保持登录及通过正常账号菜单重试退出。仅退出失败场景注入一次 HTTP 503；初始化、认证和最终退出使用真实 API、PostgreSQL 与 Redis。
- 验收发现并修复了旧欢迎副标题断言、提醒标题跳级、旧错误横幅与 Retry 按钮断言、菜单退出动画期间过早执行 axe 的问题。
- 本轮临时容器和数据库在验收后清理；没有操作已有开发用户或其他应用数据。

运行时来自打包测试导出的候选产物，SHA-256：`9e2fafddbd354eeb5dac6376dc8c55c1684f762cd35b87135196ac28bdf03943`。最终包 SHA-256 为 `4130595a40d9ea7372dc9916e7f669152c0d61700f0646d2393fa687f30e3208`，大小 291,774 字节。两包逐文件比较只有 E2E 测试文件发生变化；应用运行时代码完全一致，最终测试文件正是上述浏览器通过时使用的版本。

最终包全部模板文件与本地工作区逐字节一致，源码与 Centaurus 的校验和同步检查无差异。最终包位于 Centaurus 的 `/tmp/temvia-release-final/create-temvia-0.1.0.tgz`，本地副本位于 `/tmp/temvia-release-final-centaurus/create-temvia-0.1.0.tgz`。

## 发布门禁验证

直接执行工作流的 preflight 校验脚本，5 项均符合预期：

- 完整匹配的提交及两项确认：允许继续。
- 未确认 macOS 验收：拒绝。
- 未确认发布文档与许可就绪：拒绝。
- 验收提交与待发布提交不一致：拒绝。
- 提交标识不是完整 SHA：拒绝。

工作流仅配置 workflow_dispatch，发布任务依赖验证任务成功；实际 GitHub Actions 运行尚未执行，不用脚本校验冒充线上执行证据。

## 自动化检查

Centaurus 最终结果：

- API：常规 `go test ./...`、`go vet ./...`、构建通过。最终命令未配置 TEST_POSTGRES_DSN、TEST_REDIS_ADDR、TEST_REDIS_PASSWORD，因此可选 PostgreSQL / Redis adapter 集成测试按设计跳过；不将它们报告为已执行。macOS 浏览器流程另使用了真实 PostgreSQL 与 Redis。
- Admin：lint 0 错误、1 条既有 warning；类型检查、20 个文件 / 120 项测试和生产构建通过。
- 根项目：类型检查、构建、12 项 CLI 测试、Git 测试通过；最终真实 tarball 测试 2/2 通过。
- Playwright 测试发现列出 3 个文件 / 10 项测试；这只是发现检查，本轮实际浏览器执行范围为上述 1 项完整认证流程。
- 工作流 YAML 解析、发布前门禁校验和 `git diff --check` 通过。

实施过程中曾在 macOS 并行执行前端单测时出现 3 项 5 秒超时；未为此放宽断言或修改产品行为，最终按照项目执行约定以 Centaurus 的全套通过结果为准。早期打包测试已验证先失败后通过。

## 发布前仍需完成

- 用户验收后提交代码，将实际验收证据绑定最终发布源码提交。
- 在 GitHub 的 npm 环境配置 NPM_TOKEN；当前未发现此 Secret，不读取或记录令牌值。
- 主动触发 GitHub Actions，确认 npm 实际发布及公开 `pnpm create temvia@latest` 验证结果。

GitHub 仓库已公开，npm 发布环境已创建，私密漏洞报告已开启。上述配置不等于 npm 已发布。
