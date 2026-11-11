# 管理员直接创建账号

Status: resolved
Triage: ready-for-agent
Progress: implementation and self-tests complete; ported to Bind Plane and verified in its sandbox and production; user accepted and authorized commit/push (see verification.md)

## Problem Statement

账号目前只有两个来源：初始设置链接（只创建第一位 Super Admin）和邀请。邀请靠邮件送达，没有配置邮件服务、或对方收不到邮件时，管理员无法给任何人开账号；有时管理员也只是想把一个现成的账号交给别人用。

## Solution

管理员在「用户」页直接创建账号：填写姓名、邮箱（登录账号）、角色和初始密码，可一键生成符合密码规则的强密码，创建成功后只显示这一次，方便复制交给对方。

「首次登录必须修改密码」默认勾选。勾选时，对方用初始密码登录后只能修改密码或退出登录，其他页面和接口一律拒绝（403 `password-change-required`）；修改密码沿用现有流程（核对当前密码、撤销全部会话），之后用新密码重新登录即可正常使用。取消勾选时账号可直接使用，适合多人共用的账号。

权限与邀请一致：需要用户写入与角色读取权限；非 Super Admin 只能授予自己权限范围内的非系统角色。邮箱已被现有账号使用时拒绝；该邮箱已有待接受的邀请时也拒绝，请先撤销邀请。创建记入操作历史（不含密码）。

## User Stories

1. As an 管理员, I want 不经邮件直接创建账号, so that 没有邮件服务时也能给别人开账号。
2. As an 管理员, I want 自己设定或一键生成初始密码, so that 可以当面或通过聊天把账号交给对方。
3. As an 管理员, I want 生成的密码只显示一次, so that 密码不会长期留在页面上。
4. As an 管理员, I want 默认要求对方首次登录修改密码, so that 我知道的初始密码只用一次。
5. As an 管理员, I want 可以不要求修改密码, so that 可以创建多人共用的账号。
6. As an 新账号使用者, I want 首次登录后直接进入修改密码页面, so that 不会误以为账号不可用。
7. As an 新账号使用者, I want 改完密码用新密码重新登录, so that 旧会话和初始密码都不再有效。
8. As an 管理员, I want 在用户列表看到哪些账号还没改初始密码, so that 可以跟进。
9. As an 操作历史查看者, I want 看到谁在何时创建了哪个账号, so that 账号来源可追溯。

## Implementation Decisions

- `auth_users.password_change_required boolean NOT NULL DEFAULT false`。修改密码与重置密码时清除。
- `POST /api/users`：`{ name, email, password, roleIds, requirePasswordChange }`，成功返回 201 与用户。操作历史动作 `users.create`。
- 认证：普通的会话解析在需要修改密码时返回 `ErrPasswordChangeRequired`；只有 `GET /api/auth/me`、`GET /api/auth/session-status`、`PUT /api/auth/me/password`、`POST /api/auth/logout` 使用允许该状态的解析。`me` 与登录响应带 `passwordChangeRequired`。
- 前端：`/_authenticated` 在 `passwordChangeRequired` 时跳到 `/change-password`；创建对话框的密码只在本地状态，不进草稿存储。

## Out of Scope

- 管理员替他人重置密码、以用户名代替邮箱登录、批量创建。
