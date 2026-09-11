# 用户生命周期 — 直接续做与验收记录

Status: resolved — user accepted and authorized commit/push
Baseline: 0b40ce10f61ffe7077daa2d4a33f0e89c2ab5a0b
Spec: user-lifecycle/spec.md（原始产品范围未修改）

## 续做方式

用户要求继续后，由主代理直接补齐，不再委派 Luna。之前 review.md 中的“第三轮未通过”是当时的历史状态，不代表下面这些补齐后的结果。未创建提交。

## 已补齐

- 停用、恢复、删除使用必填 authVersion，删除了不可用的无版本兼容分支。服务端验证本人保护、实时操作者权限、目标版本及最后可用 Super Admin。
- 生命周期事务与角色修改使用一致的角色先于用户的锁顺序。停用管理员不计入可用数量；删除已停用 Super Admin 不会错误阻止保留一个正常管理员的情况。
- 会话创建在账户锁下检查状态和版本；触摸会话和重置完成使用账户先于依赖记录的锁顺序。旧会话不能在恢复后复活。
- 仅为停用时仍有效的真实会话保留 disabled_revoked 原因标记。认证、HTTP 和 SessionMonitor 已接通 account_disabled；未知凭据和匿名登录不获得该状态。
- 停用撤销密码重置权限并取消未完成的账号安全邮件，已领取任务不能重新标记成功或恢复链接；不承诺撤回已发送邮件。
- 审计操作者 UUID 不再级联清空，删除后以及删除时已经在途的审计写入仍保留原 ID。最小历史身份记录无密码、角色或恢复入口。
- 历史列表、详情及原 ID 筛选能显示原姓名、邮箱和“已删除用户”；邮箱复用不会绑定旧历史。
- 邀请创建者身份在迁移/创建时保存，删除后邀请继续有效，目标查询、管理和接受均可执行，邀请页面展示原创建者及删除标记。
- 生命周期成功/失败按实际动作记入操作历史；增加本人保护、停用、最后管理员和不存在等本地化反馈。
- 用户页面使用现有 Select、Badge、Dialog 和反馈组件；提供状态筛选、逐个操作、本人按钮禁用、邮箱匹配删除确认、等待态和冲突刷新。
- 更新中英文文档、用户写入权限文案、模板分发文件清单。
- 迁移回退在有停用用户或已删除身份时明确拒绝，不静默恢复访问或删除关联记录。

## 实际执行的验证

### 后端

在独立 PostgreSQL 18.6 容器中执行全套真实迁移。数据库适配器测试使用一次性数据；HTTP 集成测试各自在隔离 schema 中执行仓库迁移。

- `TEST_POSTGRES_DSN=... go test -p 1 ./...`：通过，包括真实 PostgreSQL 与 HTTP 集成测试。
- `TEST_POSTGRES_DSN=... go test -race -p 1 ./internal/auth/adapter/httpapi ./internal/auth/adapter/postgres -run 'TestUserLifecycle|TestOnlineHTTPConcurrent' -count=1`：通过。
- `go vet ./...`：通过。
- API 构建：通过。

新覆盖包含：
- 全局用户写入管理高权限目标、本人保护、无效 ID、缺少/过时版本。
- 两个 Super Admin 的并发停用、并发删除，以及停用与移除 Super Admin 角色的竞争。
- 删除已停用管理员、角色变更不能依赖停用管理员满足最后管理员约束。
- 停用及恢复的真实会话/重置行为，未知 token 不泄露状态。
- 已领取邮件取消后不能恢复任务，旧重置链接失效，恢复后新申请可正常完成。
- 删除前/后在途审计写入、原 ID 过滤、已删除 actor/target 标记。
- 创建者删除后邀请继续查询和接受；相同邮箱重新邀请产生新身份。
- 真实版本 9 → 10 迁移的创建者快照回填与有删除数据时拒绝有损回退。

### 前端

- `pnpm lint`：通过，保留既有 data-table React incompatible-library 警告。
- `pnpm check`：通过。
- `pnpm test`：21 个文件，132 项测试通过。
- `pnpm build`：通过。

新增组件测试覆盖确认邮箱、取消无副作用、本人保护、中文恢复确认、状态筛选、失败反馈、只读界面及停用专属提示。

### 浏览器

使用最终 API 构建和当前前端，在独立安装上实际启用：

`PLAYWRIGHT_BASE_URL=http://127.0.0.1:36174 E2E_USER_LIFECYCLE=1 pnpm exec playwright test e2e/user-lifecycle.spec.ts --workers=1`

结果：1 passed。测试未跳过。两个独立浏览器上下文完成停用、原用户被提示后退出、恢复后新登录、输入邮箱删除、删除后立即拒绝会话、原身份历史及中英文删除标记。已查看生成的历史页面截图。

测试最初错误地把打开模态框后隐藏的行当成删除完成；已改为等待 DELETE 204、确认框关闭，再验证删除及会话拒绝，避免假阳性/时序错误。

### 分发

- 根目录 `pnpm check`、`pnpm build`：通过。
- `pnpm test`：12 项通过。
- `pnpm test:git`：5 项通过。
- `pnpm test:package`：2 项通过。
- `git diff --check`：通过。

## 验收环境

保留独立预览 http://127.0.0.1:36174（不是原 temvia-preview），使用专门的 lifecycle_e2e 数据库。
管理员 admin@example.com，密码 Admin1!x；另有 target@example.com 同密码，供停用/删除验收。
E2E 已删除用户的历史也保留，可验证邮箱重复使用仍对应不同用户标识。
没有清空、迁移或重建原预览数据库。

进程和原始测试日志保存在本机 /tmp/temvia-lifecycle-e2e/；临时密钥只保存在该临时目录，未纳入仓库。
