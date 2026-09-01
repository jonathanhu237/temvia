# Temvia

[English](README.md) | 简体中文

Temvia 是一个用于生成 Go 后端与 React 管理前端的 CLI 脚手架。

生成的项目包含独立的 Go API、React 管理前端，以及使用 PostgreSQL、Redis、
仅开发环境启用的 Mailpit、独立迁移容器和 Caddy 同源网关的 Compose 部署。
认证模块还包含基于事务 outbox 的异步忘记密码链路。

```sh
pnpm install
pnpm build
node dist/cli.js my-project --module example.com/my-project/api
```

生成过程不会安装依赖、创建密钥、执行迁移或启动服务。首次运行所需的
初始化链接、本地前端开发和生产容器流程请参阅生成项目中的 README。
