# 你的项目

[English](README.md) | 简体中文

独立的 Go API 与 React 管理后台。开发使用 Vite，生产 Compose 栈使用 Caddy。
这些源码可由你自行修改或删除。

## 前置条件与验证范围

Compose 主路径需要带 Compose v2 的 Docker、Make、Node.js 24 或更新版本
（用于生成器及跨平台密钥生成）。先启动 Docker 引擎。
macOS 缺少 Make 时安装 Xcode Command Line Tools。
完整首次使用流程目前仅在 macOS 测试过；Linux 与 WSL2 尚未完整验证，
原生 Windows PowerShell 不属于这条使用路径。
容器外开发 API 需要 Go 1.27 或更新版本，开发前端需要 pnpm 11.24.0。

## 首次启动

在生成项目根目录复制环境变量示例，填写全部四项秘密配置：
`POSTGRES_PASSWORD`、`PASSWORD_RESET_TOKEN_KEY`、`INVITATION_TOKEN_KEY`、
`EMAIL_SETTINGS_ENCRYPTION_KEY`。

```sh
cp .env.example .env
chmod 600 .env
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

重复执行密钥生成命令，为每个值使用不同的输出，将结果填入 `.env`，不要提交或共享该文件。
后三项密钥必须是 32 个随机字节的不带填充 Base64URL 编码；上述命令也适用于 PostgreSQL 密码。
确认配置完成后：

```sh
make build
make migrate-up
make up
docker compose logs api
```

系统未初始化时，API 日志会输出临时初始化链接。在浏览器打开它并创建管理员，
随后明确登录；初始化成功不会自动创建登录会话。链接中的令牌在页面渲染前从
URL fragment 移除，仅在初始化请求正文中发送。链接过期时重启 API 并查看新日志。
不要分享包含初始化令牌的日志。

默认访问 `http://localhost:5173`。浏览器通过相对 `/api` 路径访问 API，
由 Vite 或 Caddy 代理，因此 `APP_PUBLIC_URL` 必须与地址栏 origin 完全一致。
端口冲突时在 `.env` 调整对应端口；修改 `ADMIN_PORT` 时同步修改 `APP_PUBLIC_URL`。
更改环境变量后用 `docker compose up -d api` 重建 API 容器；单纯 restart 不会载入新值。

PostgreSQL 保存账号、会话和限流状态。API 或数据库重启后，仍有效的会话继续保留；
请求会立即检查过期与撤销状态，后台任务只负责分批回收状态。`make down` 不删除
PostgreSQL 数据卷。除非明确要删除数据库，不要执行 `docker compose down -v`。

`SHUTDOWN_TIMEOUT` 是唯一的优雅停机预算，默认 30s。API 与 Compose 的
`stop_grace_period` 读取同一个值；预算从首次 SIGINT/SIGTERM 开始，并包含内部退出预留。
API 会停止接受新的 HTTP 请求，并行排空在途请求和已领取邮件，取消后台维护，只有这些任务
结束后才关闭数据库。预算耗尽或第二次终止信号会以非零状态退出；非法或非正值会在启动时拒绝。

## 配置与邮件

`.env.example` 是完整环境变量清单：包括浏览器 origin、服务地址与映射端口、
数据库连接池、会话过期时间、登录及密码找回限流、邀请与重置链接时效、
邮件派送超时和重试设置。Compose 读取 `.env`；Go API 仅读取进程环境变量，
不会自行解析 `.env`。在容器外运行时需要将这些值导入进程，并将数据库
地址改为宿主机可达的地址。

`make up` 启用仅供开发的 Mailpit。界面为 `http://127.0.0.1:8025`，
可以通过 `MAILPIT_UI_PORT` 修改。SMTP 仅在 Compose 网络内监听 `mailpit:1025`。
登录后在系统设置配置 SMTP：主机 `mailpit`、端口 `1025`、安全模式 `none`、
不填凭据并设置测试发件人。启动容器本身不会自动保存这些邮件设置。

生产环境使用真实 SMTP 服务，在系统设置填写 `starttls` 或 `tls`、真实发件地址
和服务要求的配套凭据。系统设置也可配置默认邮件语言、系统名称与图标。

密码找回通过 PostgreSQL transactional outbox 异步发送。请求只提交状态，进程内派送器
随后领取任务并发送 SMTP，没有额外消息队列或 worker 服务。临时故障持久重试，
过期任务和旧记录会自动清理。SMTP 接收后进程中断可能产生重复邮件；系统使用稳定
Message-ID 和一次性重置权限处理至少一次投递。

稳定保存并单独备份 `EMAIL_SETTINGS_ENCRYPTION_KEY`，它加密数据库中的 SMTP 密码。
`PASSWORD_RESET_TOKEN_KEY` 和 `INVITATION_TOKEN_KEY` 也应跨重启保持稳定且互不共用。
主动轮换重置密钥会使尚未投递的旧密钥任务失效；已投递链接仍按数据库中的摘要验证，
受影响用户可以重新申请。邀请链接默认 72 小时，可用 `INVITATION_LINK_TTL` 配置，最长七天。

## 开发

### API

在准备好进程环境变量、可访问的 PostgreSQL 并完成迁移后：

```sh
cd api
go run ./cmd/server
```

`GET http://127.0.0.1:8080/health` 返回 `{"status":"ok"}`。
`HTTP_ADDR` 可修改监听地址；配置缺省时仅监听本机，Compose 示例则显式监听容器所有接口。
不要让宿主机 API 与 Compose API 使用相同宿主机端口。

```sh
go test ./...
go vet ./...
go build -o bin/server ./cmd/server
go test -bench='Benchmark(Hasher|Verifier)$' -benchtime=1x ./internal/auth/adapter/password
```

发布应用前在部署目标评估 Argon2id 哈希成本。环境变量不会因执行这些命令自动加载。

### 管理前端

从项目根目录停止 Compose 前端，让开发服务器使用该端口，然后在另一终端运行：

```sh
docker compose stop admin
cd admin
pnpm install --ignore-scripts
pnpm dev
```

打开 Vite 实际打印的 URL，默认 `http://127.0.0.1:5173`；端口占用时 Vite 会尝试下一端口。
首次安装生成前端自己的锁文件，应纳入版本控制。API 的 `APP_PUBLIC_URL` 必须等于
Vite 打印的 origin（包括 localhost 与 127.0.0.1 的差异和端口）。修改根 `.env` 后
在项目根目录执行 `docker compose up -d api`，如需初始化则从日志读取新链接。
Vite 代理从根 `.env` 读取 `API_PORT`。

```sh
pnpm lint
pnpm check
pnpm test
pnpm build
pnpm preview --host 127.0.0.1
```

lint 使用 Oxlint，check 使用 TypeScript，test 运行单元及组件测试。
preview 只检查本地构建，生产由 Caddy 提供 `/api` 代理与 SPA 路由回退。
各应用独立管理依赖和配置，没有根 workspace；生成器不安装依赖。

## 生产部署与升级

使用 `APP_ENV=production`，`APP_PUBLIC_URL` 设置为公开 HTTPS origin。
通过外部 ingress 或自定义 Caddy 提供 TLS；默认 Compose 网关只绑定本机 HTTP，
不自动配置公网 DNS 或 TLS。后端和数据库端口保持私有。
Nginx 可替代 Caddy，但必须保留相同的 API 代理及 SPA 回退行为。

```sh
make build
make migrate-up
docker compose up -d api admin
```

生产不要使用 `make up`，它会启用开发 Mailpit。使用真实 SMTP。
升级应用前停止 API、备份 PostgreSQL、执行全部新迁移后再启动新 API：

```sh
docker compose stop api
make migrate-up
docker compose up -d api admin
```

回滚前检查受影响的每项迁移并匹配 API 版本，不要把执行一次 down 当成通用回滚方案。
数据库与加密／签名密钥分别备份。

## 账号、权限和邀请

首位管理员获得不可修改的 Super Admin 内置角色。
“用户与权限”包含用户、邀请和角色；权限按资源分别授予读取和写入，写入不隐含读取。
角色编辑器和 API 验证跨功能所需权限组合。委派管理员只能管理其有效权限范围内的邀请角色。
自定义角色至少一个权限，用户与邀请至少一个角色；已分配角色不可删除，
系统拒绝使可用 Super Admin 数量降为零的修改。

邀请与已激活用户分开。一次性链接打开 `/accept-invitation#token=...`，
页面渲染前移除 fragment，接受邀请原子创建账号和角色分配后需要明确登录。
密码找回请求对已知和未知邮箱都返回相同 202；重置成功使旧会话失效并要求重新登录。

## 操作历史

具有 `operation-logs.read` 权限的管理员从“系统监控 → 操作历史”进入。
支持时间、操作者 UUID、动作、结果、对象类型及 ID 筛选、游标分页和本地化详情。
范围内操作成功或失败各生成一条尽力记录，存储故障可能产生缺口；
有读取权限的首页显示记录状态提醒。默认保留 180 天，具有设置写入权限者可配置
1–3650 天，清理每小时运行且限制单次工作量。

来源 IP 默认记录直接连接地址。反向代理部署通过 `TRUSTED_PROXY_CIDRS` 配置
可信的直接代理网络，才读取其转发 IP 头。不可信来源的头会忽略，不要填入公共客户端网段。

## 在线用户与强制退出

“系统监控 → 在线用户”按账号展示至少持有一个有效登录会话的用户。
关闭页面或暂时无活动不代表离线。列表显示姓名、邮箱、有效会话数和最近活动时间，
每 15 秒刷新；已登录页面每 30 秒检查会话，浏览器休眠时可能延迟。

`online-users.read` 允许查看；`online-users.write` 允许强制退出，两者独立。
可强制退出任意用户，包括 Super Admin 和本人。所有旧会话被撤销，用户仍可重新登录。
服务端下次请求立即拒绝旧会话，联网页面在会话检查后显示失效提示并跳转登录页。
成功和失败的强制退出操作均进入操作历史。

## 许可与后续修复

Temvia 提供的代码使用 MIT；保留 LICENSE 和 `admin/UPSTREAM.md` 中的第三方声明。
你拥有自己新增的代码。生成项目没有 Temvia 运行依赖，不自动获取模板升级。
参阅 [Temvia 版本记录](https://github.com/jonathanhu237/temvia/releases)并自行合并适用修复。
缺陷和建议通过 [Issues](https://github.com/jonathanhu237/temvia/issues)，
安全问题使用 [SECURITY.md](https://github.com/jonathanhu237/temvia/blob/main/SECURITY.md) 中的私密入口。
项目尽力维护，不承诺固定响应时间或旧版本支持。
