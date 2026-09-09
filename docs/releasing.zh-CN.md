# 发布 create-temvia

发布流程由维护者手动触发 GitHub Actions。只有维护者在 `main` 分支选择
`.github/workflows/release.yml` 的 **Run workflow** 才会发布到 npm；普通推送不会
发布。输入版本必须与 `package.json` 完全一致，首个公开版本为 `0.1.0`。

## 执行 Run workflow 前的发布前验收

针对准备发布的源码提交，使用由该提交打出的实际 tarball 完成 macOS 首次启动验收。
在全新目录从该 tarball 生成项目，填写文档中的五项秘密配置，执行
`make build`、`make migrate-up` 和 `make up`，从 API 日志打开初始化链接，创建首个管理员并登录。
记录 tarball 的 SHA-256，以及切换到该源码后通过 `git rev-parse HEAD` 得到的完整提交 SHA。
这是发布门槛；其他机器上的组件检查不能替代它。

触发工作流前，还要确认同一源码提交中的中英文启动和发布文档、根目录及生成项目的 MIT
许可证、上游声明和 `CHANGELOG.md` 均已完成。在 **Run workflow** 中把完整小写 SHA 填入
`verified_commit_sha`，勾选 `macos_acceptance` 和 `release_readiness`，再输入包版本。
工作流会把 SHA 与 `GITHUB_SHA` 比较；缺少任一确认，或验收证据属于其他提交时，会在打包和发布
之前停止。

## 首次发布：配置 npm Token

首次发布尚未配置 npm Trusted Publisher，因此使用 npm granular access token。

1. 确认拥有 `create-temvia` 的 npm 账户可以发布该包，且 GitHub 仓库已公开。进入
   npm 的访问令牌设置，创建 granular access token，按首次发布可用的最小包和 scope
   权限配置读写权限，设置较短有效期；只有 npm 的发布策略要求时才启用 `Bypass 2FA`。
   将 Token 保存在密码管理器中。npm 推荐条件允许时使用 Trusted Publisher，本 Token
   只是本次启动发布流程的凭据。
2. 在仓库 **Settings → Environments** 打开 `npm` 环境，添加名为 `NPM_TOKEN` 的环境
   Secret。GitHub CLI 等价命令是 `gh secret set NPM_TOKEN --env npm`，它会交互读取值；
   不要把 Token 放在命令参数、源码、Issue 或日志中。
3. 可以为 `npm` 环境增加 required reviewers 和 `main` 分支部署规则。环境保护规则通过
   前，发布任务无法读取 `NPM_TOKEN`。
4. 在 Actions 页面选择 **Release → Run workflow**，选择 `main`，输入版本、
   `verified_commit_sha` 和上面说明的两项发布前确认。发布成功后不要重复运行相同版本；npm
   版本不可覆盖。

Token 只提供给发布步骤。验证任务无需 Token，且必须完成后环境发布任务才会开始。
必要检查失败时发布任务会被跳过。工作流不会创建 Git 提交或标签。

## 工作流验证内容

发布前会检查包名、版本、公开元数据和 MIT 许可证，然后执行生成器类型检查、构建、
CLI 测试、Git 集成测试、API Go 测试／vet／构建，以及生成项目管理后台的 lint、TypeScript
检查、单元测试和构建。包验收测试会创建 tarball，在没有开发依赖的情况下安装它，并从
该 tarball 生成项目，检查文件清单和 Go 模块替换。

工作流上传的正是已经通过验收的 tarball，并附带 SHA-256 校验值。发布任务下载并校验
该文件后才运行 `npm publish`。npm 完成传播后，工作流在全新临时目录通过公开注册表运行
`pnpm create temvia@latest`，检查生成的中英文 README、许可证和 Go 模块。该公开入口验证
属于发布证据，不能替代项目文档中单独完成的 macOS 首次启动验收。

## 以后可选迁移到 npm Trusted Publisher

npm 支持通过 OIDC 使用 GitHub Actions Trusted Publisher。首版可以继续使用 Token；在替代
方案配置并验证成功前，不要删除 `NPM_TOKEN`。

1. 在 npm 包设置中添加 GitHub Actions **Trusted Publisher**，填写用户或组织
   `jonathanhu237`、仓库 `temvia`、工作流文件名 `release.yml` 和环境名 `npm`。npm 要求
   这里只填写文件名，实际文件位于 `.github/workflows/`。
2. 为发布任务增加 `id-token: write` 权限，删除 `NPM_TOKEN` 检查和 `NODE_AUTH_TOKEN` 环境变量，
   并在开启 provenance 的情况下发布已下载的同一 tarball。保留 `main` 源码检查、环境保护、
   校验和检查及公开 smoke test。
3. 使用新版本运行并确认 npm provenance attestation 后，再删除旧环境 Secret。

参阅 [npm Trusted Publishing 指南](https://docs.npmjs.com/trusted-publishers/)、
[npm 访问令牌说明](https://docs.npmjs.com/about-access-tokens/)以及
[GitHub 环境和 Secret 文档](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments)，
了解这些步骤所依据的平台规则。

## 发布后

在发布说明中记录 Actions 运行链接、已发布版本、经过测试的 tarball SHA-256、npm 包链接
以及公开 `pnpm create` smoke 结果。下个版本前更新 `CHANGELOG.md`。生成项目是独立源码副本，
不会自动接收这些改动。
