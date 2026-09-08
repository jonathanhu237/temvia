## Agent skills

Use globally installed skills in `~/.agents/skills/`. Do not vendor skill copies or a `skills-lock.json` in this repository.

### Issue tracker

Issues and specs are tracked as local Markdown files under `.scratch/<feature-slug>/`. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context layout with root `CONTEXT.md` and `docs/adr/`. See `docs/agents/domain.md`.

### 后台界面规范

- 后台页面只保留一个页面主标题，不添加说明性副标题或重复标题。
- 管理员终止用户所有设备登录的产品用语统一为“强制退出 / Force sign out”，覆盖按钮、权限名称、确认框、反馈和操作历史；不用“踢下线”。本人主动退出仍称“退出登录”。
- “系统监控”为一级菜单，二级菜单依次为“在线用户”“操作历史”。“用户与权限”保留用户、邀请、角色；“系统设置”保持在一级菜单末尾。
