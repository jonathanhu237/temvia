# Changelog / 版本记录

## 0.3.0

- User deactivation, reactivation and deletion, including session invalidation and historical identity preservation.
- A single system name, refined user action menus, clearer login validation and an aligned online-user toolbar.
- A minimal personalized home page for every signed-in role.
- Automatic builds on push and commit-based npm releases from main, with verified tarballs, source tags and retry checks.
- The generated migration image now carries every forward and reverse migration; Git remains optional for generation while real Git errors stay visible.
- Saved SMTP passwords are reused only for the unchanged host, port, and username; changed identities require a replacement or explicit clear.
- A mandatory Ubuntu fresh-Compose browser gate now initializes and explicitly logs in from the exact release tarball before publication.

- 新增用户停用、恢复和删除，覆盖会话失效与历史身份保留。
- 统一系统名称，优化用户操作菜单、登录校验反馈与在线用户工具栏。
- 首页统一为当前用户的简洁欢迎信息。
- 每次 push 自动构建，main 按提交类型自动升版发布，保留安装包验收、源码标签和重试校验。
- 迁移镜像自动包含全部正向与逆向迁移；Git 在生成器中保持可选，但真正的 Git 错误仍会明确报告。
- 已保存 SMTP 密码只在主机、端口和用户名不变时复用；身份变化后必须替换密码或明确清除。
- 发布前新增 Ubuntu 全新 Compose 浏览器门禁，使用实际发布 tarball 完成初始化和明确登录。

## 0.2.0

- Basic abuse protection for login, password recovery, setup, invitations and test email, with operation-specific limits and trusted proxy handling.
- Automatically recovering PostgreSQL token buckets, configurable through environment variables; distinct responses for rate limits and unavailable dependencies.
- PostgreSQL replaces Redis for sessions and rate-limit state, removing the Redis deployment dependency.
- Bounded graceful shutdown with a configurable shared shutdown budget.
- Expanded HTTP/PostgreSQL integration tests, frontend error-message coverage and bilingual deployment documentation.

- 为登录、密码找回、初始化、邀请和测试邮件提供基本防滥用，按操作分别限流并正确处理可信代理来源。
- 使用可自动恢复的 PostgreSQL 令牌桶，通过环境变量配置，区分请求超限与依赖不可用。
- 会话及限流状态改由 PostgreSQL 保存，移除 Redis 部署依赖。
- 新增有界优雅停机，支持配置统一停机预算。
- 补充 HTTP/PostgreSQL 集成测试、前端错误提示测试及双语部署文档。

Generated projects remain independent source copies and do not automatically
receive these changes. Complete the documented tarball first-run acceptance for
the final release commit before publishing; the release gate covers its Ubuntu
CI route, not every operating system or production environment.

已生成项目仍是独立源码副本，不会自动接收这些变更。发布前需针对最终发布提交的
tarball 完成文档规定的首次启动验收；发布门禁覆盖 Ubuntu CI 路径，不代表所有操作系统或生产环境。

## 0.1.0

First public release / 首次公开发布。

- Independent Go API and React admin generated through `pnpm create`.
- Administrator setup, authentication, password recovery, invitations and RBAC.
- Online users, force sign-out and operation history with retention settings.
- Email configuration, system identity, Chinese/English UI and light/dark themes.
- Compose deployment with PostgreSQL, Redis, Caddy, explicit migrations and development Mailpit.
- Bilingual first-run and deployment documentation; MIT licensed original code.

通过 pnpm create 生成独立项目；包含初始化、认证、密码找回、邀请与权限、在线用户、
强制退出、操作历史、系统设置、中英文和主题切换，以及 Compose 部署和双语文档。

Only the complete macOS first-run route has been tested. Linux/WSL2 remain
unverified for the full route. Generated projects are independently maintained;
there is no automatic upgrade or migration from older template snapshots.
This first release has no previous public version to migrate from.

完整首次使用流程仅在 macOS 测试过，Linux/WSL2 尚未完整验证。
生成项目自行维护，不自动升级。本次没有需要迁移的先前公开版本。
