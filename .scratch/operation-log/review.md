# 操作日志最终审查

Status: resolved

## 继续实施后的验收结果

用户重新调用 implement-loop 后，本轮第 1 次审查通过。以下旧报告的 3 项 Spec 问题和生成器清单失败均已修复，未提交 Git。

- 冲突丢弃会重新查询最新设置，确认 owner、submission 和 conflict 状态仍匹配后才恢复草稿；测试验证新 revision 用于再次保存，查询失败则保持冲突并禁止保存。
- 管理操作直接记录业务执行前验证过的 principal.User，移除变更后的会话查询；会话失效回归测试确认姓名、邮箱不丢失。
- 用户角色分配和邀请快照包含角色名称、描述、权限及 revision，不再仅保存 ID。
- 精确模板清单补齐 Admin 测试、Go 测试及第 6 版迁移文件。

最新 Centaurus 验证：Go 9 个包通过；隔离 PostgreSQL 集成 6 个顶层测试通过、未跳过；Admin typecheck、17 个文件 / 107 项测试、build 通过；根目录 test 12/12、test:git 5/5、test:package 2/2 通过。git diff --check 通过。API 和 Admin 已重建部署。

Standards：无新增硬性规范违反，旧报告的重复逻辑建议仍为非阻断项。Spec：0 项待修复缺陷。本轮范围是上一轮遗留问题及其受影响路径，没有扩大功能范围。

## 上一轮审查记录（下列缺陷现已修复）

审查轮次：3 / 3。结论：未通过，等待用户验收决定；未提交 Git。

基线：`d15f3dd3bfa8af7f440fd1a433b3a0f22eb9baf0`。范围包含本轮未提交变更与新增文件；实现前已有的 CONTEXT.md 和讨论文档不计为实现缺陷。需求依据：本目录 discussion.md 的「最终收敛」。

## Standards

未发现新的硬性项目规范违反。一个非阻断的启发式建议：application/access.go 的 DeleteRole / DeleteRoleWithSnapshot、ResendInvitation / ResendInvitationWithSnapshot、RevokeInvitation / RevokeInvitationWithSnapshot 重复授权和业务准备逻辑，属于 possible Duplicated Code。后续可让兼容入口调用同一实现再丢弃快照，避免修正授权规则时只更新一个分支。这不是本次未通过的主要原因。

## Spec

### [P2] 冲突恢复继续使用旧版本

位置：template/admin/src/features/settings/operation-log-retention-card.tsx:55、68。

保存返回 stale revision 时，没有重新查询最新设置；「丢弃草稿」直接采用原 query.data 的旧 revision。另一管理员已保存后，当前用户丢弃草稿再保存仍会冲突，必须额外刷新页面才能恢复。应先获取最新权威值，再用新 revision 恢复草稿。需要覆盖「旧 revision 保存失败 → 丢弃 → 使用新 revision 保存成功」的回归测试。

### [P2] 修改自身权限后可能丢失操作人快照

位置：template/api/internal/auth/adapter/httpapi/operation_logs.go:263；routes.go:800。

管理写入通常只传 ActorID，recordOperation 在业务成功之后重新调用 currentPrincipal 获取姓名和邮箱。修改自身角色分配，或修改分配给自己的角色权限，会递增 auth_version；Authentication.Current 随后判定原会话失效，导致姓名和邮箱快照为空。列表已经不再关联当前用户表，页面会显示未知操作人。应直接传入业务执行前已验证 principal.User 的完整安全快照，且补充权限变更使当前会话失效的测试。

需求依据：「记录操作人、发生时间、动作、对象、结果」。

### [P2] 角色分配和邀请仍未保留完整角色快照

位置：template/api/internal/auth/adapter/httpapi/routes.go:796；operation_logs.go:409。

users.roles.update 的 after 仍只有 roleIds，邀请快照也仅序列化 roleIds，未保存角色名称、描述和权限等已经可用的安全字段。角色以后改名或删除后，历史无法解释当时授予了什么角色。before 的 accessUserSnapshot 已保留角色描述，可复用于 after；邀请应采用同样的安全角色快照。需要验证角色改名或删除不会改变历史详情。

需求依据：「记录操作对象和有意义的变更前后值」。

## 验证

- Centaurus：Go 全套测试通过；最新 PostgreSQL adapter 集成测试在隔离库 temvia_operation_log_test 中设置 TEST_POSTGRES_DSN 后通过，非跳过。
- Centaurus：Admin 17 个测试文件、106 项测试通过；pnpm build 通过。
- 本地 git diff --check 通过。
- Chrome：实际部署的 UUID v7 筛选已可查询；保留天数清空后可重新输入有效值。测试没有保存设置，已恢复 180。
- **失败**：父代理在最新远端代码执行根目录 pnpm test，12 项中 10 项通过、2 项失败。tests/react-ts-baseline.mjs:25 的精确 Admin 文件清单缺少新增的 src/features/operation-log/operation-logs-page.test.tsx，导致 bundled inventory 和 generation filtering 两项失败。必须更新清单后重跑；早期生成器测试通过不能代表当前版本。
- 当前没有覆盖所有写动作的端到端测试，也没有首页状态权限切换及可见性轮询的独立回归测试；已有共享入口和记录器状态测试。

## 验收入口

Centaurus 的 API 和 Admin 已重建运行；本地 SSH 转发访问：http://127.0.0.1:25173/operation-logs 。API 转发端口：28090。

按用户提供的精简 implement-with-review 约定，达到三轮审查上限后停止修改；没有开始第四轮修复。

Standards：1 项非阻断启发式建议、0 项硬性规范违反；Spec：3 项 P2；另有 1 项已复现的生成器测试失败。
