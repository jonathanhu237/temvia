# Temvia

English | [简体中文](README.zh-CN.md)

Temvia is a CLI for scaffolding Go backends and React admin frontends.

The generated project contains an independent Go API, a React admin and a
Compose deployment with PostgreSQL, Redis, an explicit migration container and
a Caddy same-origin gateway.

```sh
pnpm install
pnpm build
node dist/cli.js my-project --module example.com/my-project/api
```

Generation does not install dependencies, create secrets, run migrations or
start services. See the generated README for the first-run setup link, local
admin development and production container workflow.
