# Changelog / 版本记录

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
