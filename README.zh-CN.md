# Temvia

[English](README.md) | 简体中文

Temvia 是提供 Go API 与 React 管理后台的项目模板，通过 `create-temvia` CLI 分发。
包含管理员初始化、登录和密码找回、邀请、角色与权限、在线用户与强制退出、
操作历史、邮件与系统身份设置、中英文界面以及明暗主题。

## 快速开始

准备 Node.js 24 或更新版本、pnpm 11.24.0、带 Compose v2 的 Docker 和 Make。
macOS 可通过 Xcode Command Line Tools 获取 Make（`xcode-select --install`）。
先启动 Docker 引擎。仅在容器外开发后端时需要 Go。
Git 可选；安装 Git 且目标位于已有仓库外时，生成器会初始化仓库。

```sh
pnpm create temvia@latest my-project --module github.com/your-name/my-project/api
cd my-project
```

使用新目录或空目录，将模块路径替换为自己的 Go 模块标识。
生成器不会安装依赖、生成密钥、迁移数据库、启动服务或创建提交。

接着按照生成项目的[首次启动指南](template/README.zh-CN.md#首次启动)，
填写五项秘密配置、构建容器、执行迁移并启动服务，从 API 日志找到初始化链接，
创建管理员后登录。Docker Compose 是首次启动主路径；指南另有开发和生产部署说明。

完整首次使用流程目前仅在 macOS 测试过。Linux 和 WSL2 尚未完整验证；
原生 Windows PowerShell 不属于支持的首次使用路径。
Linux 上的组件测试不代表完整安装验收。

## 所有权与维护

生成项目是独立源码副本，没有 Temvia 运行服务依赖，也不支持自动升级。
你拥有自己新增的代码，负责项目依赖和改动的维护。
根据[版本记录](CHANGELOG.md)和重要修复指引，自行判断和合并适用的上游改动。

通过 [GitHub Issues](https://github.com/jonathanhu237/temvia/issues) 报告缺陷或建议。
安全漏洞请使用 [SECURITY.md](SECURITY.md) 的私密渠道。
项目尽力维护，不承诺固定响应时间或旧版本长期支持。

## 开发与发布

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm build
pnpm test
pnpm test:git
pnpm test:package
```

维护者通过 GitHub Actions 主动发布，具体见[发布流程](docs/releasing.zh-CN.md)。
首个公开版本目标为 0.1.0。

## 许可

生成器和模板自有代码采用 [MIT](LICENSE)，允许商业和闭源使用，须保留相应声明。
生成项目的许可证覆盖 Temvia 提供的代码，不声称拥有你新增代码的版权。
同时保留[第三方声明](template/admin/UPSTREAM.md)及应用依赖各自的许可证。
