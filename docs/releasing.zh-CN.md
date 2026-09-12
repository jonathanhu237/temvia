# 自动发布 create-temvia

每次向分支 push 都运行构建、检查和打包验收，并保存安装包 30 天。
只有 `main` 在验证通过且有需要发布的改动时自动发布到 npm；其他分支只构建。
也可通过 Release 工作流的 Run workflow 重试，无需填写版本或人工验收复选框。

## 版本规则

版本以上一次成功发布到 npm 的版本和源码提交为基准，分析其后到本次 push 的**全部提交**。
请使用 Conventional Commits；无法识别的提交标题会使版本规划失败，避免静默漏发。

| 提交内容 | 版本变化（以 0.2.3 为例） |
| --- | --- |
| `feat: ...` / `feat(scope): ...` 新功能 | `0.3.0` |
| `fix: ...` 修复；`perf`、`refactor`、`revert` | `0.2.4` |
| 标题带 `!` 或正文有 `BREAKING CHANGE:` | `0.3.0`，仍保持 0.x |
| 只有 `docs`、`test`、`build`、`ci`、`chore`、`style` | 构建验证，不发布 |

同一批提交有新功能和修复时，次版本优先，只发布一个新版本；普通 merge 提交不影响判断。
即使中间构建失败，下一次仍从最后成功发布的提交计算，不会遗漏功能。
实质功能变化请使用 `feat`，不要藏在 `chore` 中。进入 1.x 时需显式调整版本策略。

工作流在临时 checkout 中写入安装包版本及 `temviaRelease.commit`，不会向 main 回写
版本提交，也不会引发循环构建。因此源码 `package.json` 的版本是本地开发基准，
npm 版本和 `v0.x.y` 标签才是已发布版本；无需每次手改 package.json。
历史手动发布的 0.2.0 没有源码元数据，脚本以其成功发布运行的提交
`a51c9e5b03e3af98d88f85bf89a5a18f09b9a666` 为一次性基准。

## 验证与发布

1. 按提交计算版本，验证版本规则。
2. 运行生成器类型检查、构建、CLI 和 Git 测试；API 测试、vet 和构建；后台 lint、类型检查、单元测试和构建。
3. 对实际 npm tarball 做安装、生成项目、文件清单和模块替换验收。
4. 发布通过验收的同一个 tarball；创建源码标签、GitHub Release，附安装包和 SHA-256。
5. 等待 npm latest 更新，通过公开 `pnpm create temvia@latest` 验证生成入口。

同一分支的运行排队执行，不中断正在发布的版本。若较新的源码已先发布，旧运行只构建，
不会将 npm 回退。registry 查询或源码历史异常时失败，不猜测版本。

这套自动流程替代原先每次发布都要手动勾选的 macOS 验收门槛。
它不代表每个版本都通过完整 macOS/浏览器验收，也不包含需要 `TEST_POSTGRES_DSN` 的真实数据库集成测试。
涉及安装、部署或关键业务流程的变更，仍应额外做相应验收；首次使用需填写四项秘密配置。

## GitHub 配置

- 仓库 Actions 已启用。
- `npm` Environment 中存在可发布 `create-temvia` 的 `NPM_TOKEN`。
- 发布 job 的 `GITHUB_TOKEN` 有 `contents: write`，用于创建标签和 Release。
- `npm` Environment 若设置 required reviewers，仍会等待人工批准；全自动发布不应配置此门槛。

npm token 仅交给发布步骤。不要把 token 写入仓库或命令参数。

## 失败与重试

构建或打包失败不会发布。npm 不允许覆盖已存在的版本。
如果 npm 已成功、但后续标签、Release 或公开入口验证失败，可以重跑失败的 job：
只有版本、源码和 SHA-512 全部匹配时，脚本才跳过重复 npm 发布并继续完成后续步骤。
其他冲突会明确失败。安装包已超过 Actions 保留期时，应重跑整个工作流。

发布记录以 npm、Git 标签、GitHub Release 和 Actions 日志为准；`CHANGELOG.md` 保留人工整理的版本说明。
生成项目是独立源码副本，不会自动接收模板更新。
