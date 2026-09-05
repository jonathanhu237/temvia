# 系统设置、邮件配置与首页提醒讨论

Status: resolved

## 最终收敛

本节及“已确认的方向”优先于后文保留的历史设计树和调研建议。本轮讨论完成；用户已调用 to-spec，正式规格见同目录 spec.md，现已按规格实现。

- Q26：首次配置默认邮件语言不提供预选项，管理员必须明确选择后才能保存。该选择独立于个人界面语言，不根据浏览器或管理员语言自动填充。
- Q27：邮件 Card 包含 SMTP 主机、端口、加密方式、可选认证用户名／密码、发件人邮箱／名称及默认邮件语言。密码保存后仅显示已设置，留空保留原密码，提供明确替换／清除操作；连接超时使用合理默认值。
- RBAC：暂不引入 Casbin；resource.read/write 独立。配置界面提供无权限／只读／读写，读写显式保存两项；通过功能权限组合明确补齐关联权限，后端校验完整性及授权上限，不在运行时隐式授予权限。
- 创建邀请并选择角色需要 invitations.write 与 roles.read，邀请读写界面组合另含 invitations.read，不依赖 users.read。
- 系统设置使用 settings.read / settings.write；查看控制导航与只读访问，写权限控制保存和测试邮件。管理员配置读写时明确获得两项，替换 Q2 原先的隐式依赖表述。首页提醒沿用查看可见、写权限可前往配置的规则。
- 角色管理与用户角色分配通过 roles.write / users.write 委派。只能授予自己实际拥有的权限；已有角色超出自身权限范围时不能修改或删除。共享角色修改对关联用户生效，保存前提示用户及邀请影响数量。保留内置角色不可编辑、仅 Super Admin 可授予或移除 Super Admin 身份、最后一个超级管理员保护。
- 初始化只创建管理员，邮件未配置不阻碍初始化和登录；未上线，不做旧 SMTP 环境变量过渡导入。邮件配置及语言在显式保存后生效。
- Q24：测试使用表单配置而不改变正式配置；Q25：SMTP 密码数据库加密存储。部署密钥与禁止密码持久化到浏览器草稿等安全实现要求在 Spec 中明确。
- 旧 API 语言输入移除、重发确认文案改为反映最新系统语言，属于既定规则的一致性落实，不再沿用原邀请语言。详细接口、字段校验和错误文案在 Spec 阶段落实。

## 已确认的方向

- Q22：普通角色管理员不能修改或删除包含自身未拥有权限的角色；修改后的权限也不得超出自身范围。
- Q23：角色修改对所有关联用户生效；保存前提示影响的用户和邀请数量，沿用内置角色及最后一个超级管理员保护。
- Q24：测试邮件使用当前表单配置，包括未保存修改；不保存配置，不影响正式邮件使用的已保存配置。
- Q25：SMTP 密码在数据库中加密存储。此前建议的部署密钥、前端不回显原密码及不持久化密码草稿属于待写入规格的安全实现细节，不将用户简短回复扩展为所有具体交互均已确认。

- 增加系统级的默认邮件语言，跨设备生效，与保存在当前浏览器中的个人界面语言独立。
- 邀请弹窗移除逐次选择邮件语言的控件，由系统配置决定新邀请的邮件语言。
- Q1：邀请邮件、密码重置邮件、密码修改成功通知统一使用默认邮件语言，替换后两类邮件随操作页面语言发送的旧规则。
- Q2 经 RBAC 讨论调整：新增可委派的 settings.read / settings.write，配置读写时显式授予两项，Super Admin 自动拥有。普通邀请管理员无需设置权限即可正常发送邀请。
- Q3、Q4：提供独立的“系统设置”入口和页面；页面内放置可配置邮件的 Card，不增加页内分类导航。以后增加其他设置时可增加相应 Card。
- Q5：已有邀请在管理员人工重发／续期时采用最新系统邮件语言，不再固定沿用首次邀请的语言。
- Q7：修改后明确点击保存才生效，未保存选择沿用现有表单草稿规则，切换页面后可继续编辑。
- Q8：多管理员并发修改采用乐观锁；设置已被修改时拒绝覆盖、提示冲突并保留草稿，由用户主动重新加载后继续。
- Q9：本轮将 SMTP 配置、发件人信息和默认邮件语言一起纳入邮件配置 Card，避免后续通过 .env 管理 SMTP 连接信息。
- Q10、Q11：在首页集中展示运行提醒（Warning），本轮先提供邮件未配置提醒，配置完成后自动消失。按当前暂定授权方案，有设置查看权限者可见，有设置管理权限者可前往配置；授权方案随下述 RBAC 讨论复核。
- Q12：邮件尚未配置时，尝试邀请、重发或申请密码重置，直接提示“邮件服务尚未配置，联系管理员。”初始化、登录及其他管理功能可正常使用；已配置但暂时投递失败继续采用重试机制。
- Q13：邮件 Card 提供发送测试邮件，默认收件人为当前管理员；保存不以测试成功为前提。
- Q14：系统尚未上线，无需旧 SMTP 环境变量配置的过渡或自动导入。
- Q15：保存后无需重启，后续发送及自动重试使用最新 SMTP 配置，已经开始的发送继续完成。任务创建时固定邮件语言，自动重试保留该语言；人工重发创建新任务并使用最新系统语言。
- Q11 后新增的 RBAC 讨论已收敛，最新方案见“最终收敛”。
- Q6、Q26：初始化不配置邮件；首次配置邮件语言必须手动选择，无默认选项。
- 本阶段执行 grill-with-docs，梳理决策并记录领域术语，尚未编写最终规格或修改应用代码。

## 历史设计树（最终状态见“最终收敛”）

- 默认邮件语言（已确认）
  - Q1 适用范围（已确认）：现有三类邮件统一采用系统配置。
    - Q5、Q15 已确认：任务创建时固定语言，自动重试保留；人工重发／续期采用最新系统语言。
    - 后续：移除旧 API 中由客户端指定语言的入口；Q14 已确认无需上线迁移过渡。
  - Q2 授权模型（已确认）：可委派查看与管理权限，管理依赖查看。
    - 后续：导航可见性、只读页面和直接访问的权限边界。
  - Q3 独立页面（已确认）：正式系统设置页面承载后续系统配置。
    - Q4 已确认：一个独立系统设置页面，内部使用邮件配置 Card，无分类导航。
    - Q7、Q8 已确认：显式保存、保留未保存草稿、乐观锁防止并发覆盖。
  - SMTP 配置（Q9 已确认纳入本轮）
    - Q13 已确认：提供测试邮件，默认发给当前管理员，保存不强制通过测试。
    - Q14 已确认：未上线，无需旧环境变量配置的过渡导入。
    - Q15 已确认：后续发送及重试使用最新 SMTP 配置，已开始的发送继续完成；语言保留任务创建时的值。
    - 后续：配置字段、凭据处理及测试邮件的详细交互。
  - 初始化（Q6 重开，新旧安装均待讨论）
    - Q10：采用首页统一运行提醒；邮件未配置作为其中一条，不将邮件配置塞进首次创建管理员表单。
    - Q11 已确认：先展示邮件未配置，完成配置后消失；查看及配置入口的权限设计随 RBAC 讨论复核。
    - Q12 已确认：邮件未配置时，上述操作提示“邮件服务尚未配置，联系管理员。”
    - 后续：首次打开邮件配置 Card 时的语言初始选项。
  - 既有语言展示
    - 后续：重新发送确认框是否继续展示邮件将使用的语言。
- RBAC 复杂度（当前讨论分支）
  - 已确认：统一使用 resource.read / resource.write，现有 invitations.manage 改为 invitations.write；设置权限沿用同样命名。
  - Q18 已确认：新增 roles.write、users.write，让自定义角色可获得角色管理和修改用户角色的能力，不再仅按 Super Admin 身份开放这些操作。保留授权范围及最后一个超级管理员保护；具体跨角色影响边界待收敛。
  - 前端按有效权限控制菜单、路由和操作，后端继续执行授权并限制数据返回；用户已理解并接受此分工。
  - Q19 最新决定：底层 read/write 独立，write 不隐式授予 read。界面提供无权限／只读／读写，选择读写显式保存两项权限；权限判断及授权上限使用实际有效权限集合，不按 write 推导 read。
  - 待确认：是否保留跨资源依赖，以及编辑共享角色时的授权范围。
  - 先明确需要解决的复杂度与实际职责差异，再判断保留或调整哪些授权规则。
  - 邮件配置剩余细节待本分支收敛后继续。

## 既有决策与待核对边界

- 旧规格允许邀请人独立选择邮件语言；此次已明确决定替换这一输入方式。
- 旧访问管理规格要求重新发送／续期沿用原邀请语言；Q5 已明确替换为使用最新系统语言。旧确认框展示原邀请语言的文案必须随之调整，具体展示方式待讨论。
- 个人界面语言继续作为浏览器偏好，不因新增系统设置而成为全局强制语言。
- 设置语言与界面语言的分离易于调整，本阶段未发现同时满足难以逆转、容易令人困惑且存在重大取舍的 ADR 决策。

## 调研依据

- RBAC 体系复核：[NIST FAQ](https://csrc.nist.gov/Projects/role-based-access-control/faqs)描述用户、角色、权限、角色层级和职责分离等模型；不规定所有产品统一采用 read/write、权限依赖自动补齐或某种角色配置界面。
- [AWS IAM 所需权限](https://docs.aws.amazon.com/IAM/latest/UserGuide/access_permissions-required.html)明确区分 API 操作和控制台导航所需读取权限，举例说明有修改权限但缺列表权限时控制台流程不可用；可视策略编辑器提供额外所需动作的警告和提示。
- [Salesforce 权限依赖](https://help.salesforce.com/s/articleView?id=platform.users_perm_dependencies.htm&language=en_US&type=5)官方搜索摘要明确 profiles / permission sets 在需要时自动启用依赖权限；网页正文加载失败，本轮仅据官方索引摘要概括，不推断具体所有交互。
- [Keycloak 组合角色](https://www.keycloak.org/docs/latest/server_admin/)通过角色组合授予相关角色，是权限打包／继承机制，不是自动推断业务操作依赖。
- 本轮综合建议（未确认）：核心权限独立；集中记录完成后台功能所需组合；配置时显示并显式补齐相关权限，后端校验配置完整性和操作者授权上限；运行时仍执行真实操作的授权检查。选择这一产品约束是为了角色独立可用，会限制跨角色拼接不完整功能，不能称为 RBAC 标准强制要求。前几轮“只提示且允许不完整配置”与“联动补齐”均是备选建议，最终行为尚未批准。

- Q20 权限依赖调研：[GitHub REST](https://docs.github.com/en/rest/using-the-rest-api/troubleshooting-the-rest-api#resource-not-accessible)支持接口要求多项权限的 AND 组合，部分接口支持替代权限组合；[AWS 服务授权参考](https://docs.aws.amazon.com/service-authorization/latest/reference/list_awsfirewallmanager.html)列出 Dependent actions，说明操作可能还需额外权限。应区分操作前置条件与隐式授予，不能将依赖直接解释为自动获得权限。
- Q20 待确认建议：集中维护操作所需权限组合，不建立全局 invitations.write 隐式授予 roles.read 的规则。创建邀请可显式要求 invitations.write 与 roles.read，其他邀请操作按实际需要分别定义；配置界面说明缺失条件，不静默补权，用户的多角色有效权限合并后判断。本轮为调研建议，尚未批准。

- Q19 重新讨论依据：[Kubernetes 授权](https://kubernetes.io/docs/reference/access-authn-authz/authorization/)按 get/list/watch/create/update/patch/delete 等独立动作授权，并无通用 write 自动包含 read 的规则。[AWS S3](https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-management.html)同样分别授权 GetObject 与 PutObject。
- [GitHub 精细令牌](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)明确 write 包含 read；[GitHub App 注册界面](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/registering-a-github-app)使用 No access / Read-only / Read & write 标签。两种模型均有成熟先例，不能把隐式包含描述成 RBAC 通则。
- 用户已确认：底层 read/write 独立，界面用无权限／只读／读写预设组合，选择读写显式保存两项权限。替换 Q19 原先的隐式包含语义，领域文档同步更新。

- RBAC Q21 调研：[Kubernetes 防止提权](https://kubernetes.io/docs/reference/access-authn-authz/rbac/#privilege-escalation-prevention-and-bootstrapping)默认要求创建／更新角色中的权限已由操作者拥有，分配角色也检查权限上限；另有显式 escalate / bind 例外授权。
- [Azure 受约束的角色分配委派](https://learn.microsoft.com/en-us/azure/role-based-access-control/delegate-role-assignments-overview)允许限定可分配的角色和接受分配的主体；这是角色分配约束，不等同于角色定义编辑规则。
- [AWS IAM 权限边界](https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies_boundaries.html)可以限制身份策略所授予权限的上限，支持受限委派；不等同于默认要求被委派者只能授予自身已有权限。
- 待用户讨论的建议：优先考虑自身权限上限，避免本阶段新增独立边界策略配置；角色共享修改的影响和可委派管理能力仍需明确，不视为已批准。

- [Slack 工作区／组织默认语言](https://slack.com/help/articles/115004236403-Set-the-default-language-of-a-workspace-or-organization)：邀请邮件使用工作区／组织默认语言，个人界面偏好独立。
- [Microsoft Entra 邀请邮件语言](https://learn.microsoft.com/en-us/entra/external-id/invitation-email-elements#how-the-language-is-determined)：支持单次指定、收件人偏好和组织通知语言等优先级。
- [Datasite 邀请邮件语言](https://datasite.my.site.com/datasiteassist/s/article/In-which-language-will-the-invitation-be-sent)：未注册收件人可由发送者选语言；已注册收件人使用自己的通知偏好。

## 当前代码事实

- 首次邀请把表单提交的 locale 同时保存到邀请与邮件任务；重发／续期读取原邀请 locale 并创建新任务。相关代码为 `template/api/internal/auth/adapter/postgres/access.go`。
- 申请密码重置与完成密码重置时，分别把各自页面提交的 locale 保存到邮件任务。完成密码重置会发送密码已修改通知。相关代码为 `template/api/internal/auth/adapter/postgres/recovery.go`。
- 邮件自动重试读取已保存的任务 locale，仅更新投递调度和租约，不重新选择语言。相关代码为 `template/api/internal/auth/adapter/postgres/outbox.go` 和 `template/api/internal/auth/application/mail_dispatcher.go`。
- 初始化请求目前没有 locale，也没有全局设置表、设置 API、设置页面或设置权限。用户账号没有持久化语言偏好。
- 当前可分配权限为 users.read、roles.read、invitations.read、invitations.manage；Super Admin 自动拥有实时目录中的全部权限。邀请管理员可能是自定义角色，设计时应避免无意要求其取得设置管理权。
- 邀请列表没有语言列；创建弹窗提供语言下拉框，重发／续期确认框展示原邀请语言。相关代码为 `template/admin/src/features/access/users-page.tsx` 和 `invitations-page.tsx`。
- SMTP 当前是启动时从环境变量加载并固定使用的配置，没有显式“未配置”状态；开发环境使用 Mailpit 默认值，生产环境缺少正确 SMTP/TLS/发件人配置会因校验失败而无法启动。
- 启动不会检测 SMTP 连通性，因此 SMTP 连接失败或凭据错误通常在投递时发现。业务请求先创建邮件任务并返回，投递器随后重试或终止任务。
- 将 SMTP 移到系统设置 Card，需要新增未配置但允许初始化／登录的状态；Q14 已确认无需旧环境变量配置的过渡导入。
- 首页 `/` 已存在，只有首页标题和用户名欢迎语，所有已登录用户均可访问；可在此扩展提醒区域，无需另建首页路由。代码为 `template/admin/src/routes/_authenticated/index.tsx`。
- 没有首页提醒 API；`/api/setup/status` 仅表示管理员是否初始化，`/health` 不检测 SMTP，也不能证明邮件已配置或投递正常。
- 现有 SMTP 配置包括主机、端口、加密模式、成对的可选用户名／密码、发件邮箱／名称及超时；没有管理端测试邮件能力或数据库中可逆凭据的加密设施。生产环境现有规则禁止无 TLS 投递。

## Comments

- 2026-09-05：用户发起 to-spec；已发布同目录 spec.md，标记 ready-for-agent，用户确认测试边界。应用代码未修改。

- 2026-09-05：用户要求 Q26 首次配置语言无默认选项、必须主动选择；同意 Q27 SMTP 字段范围和密码交互。整理最终收敛结论，结束本轮讨论，等待用户明确发起 Spec 或实现。

- 2026-09-05：用户确认 Q22 不允许管理超范围角色、Q23 共享角色修改生效、Q25 数据库加密存储。解释 Q24 后，用户确认用当前未保存表单配置发送测试邮件，正式配置在显式保存前不变。

- 2026-09-05：用户确认暂不引入 Casbin，继续采用项目自身集中封装的授权逻辑；长期模板定位不等于本轮必须引入策略引擎。既定独立权限、功能组合和授权上限方案不变，尚未实施。

- 2026-09-05：用户 LGTM 确认底层权限独立、维护功能权限组合、配置时明确补齐并保存所需权限的方案。创建邀请并选择角色的组合为 invitations.write + roles.read；邀请读写界面组合另含 invitations.read。取代此前只提示允许缺项的备选建议；未实施。核对当前依赖：前后端 RBAC 均为项目自行实现，没有使用专门的第三方 RBAC／授权策略库。

- 2026-09-05：用户确认调研后的独立权限与界面组合方案，明确替换此前 Q19 的 write 隐式包含 read 决定；仅更新讨论和领域文档，未实现。

- 2026-09-05：用户确认借鉴 Kubernetes 默认授权上限：操作者必须具备相应管理操作权限，并且只能授予自己当前有效权限范围内的权限；适用于创建／修改角色、用户角色分配与邀请角色选择。不引入独立可授予权限范围或 escalate / bind 例外。Q20 跨资源解耦仍未明确确认；对已有超范围角色的修改／删除及共享角色影响边界仍待收敛。

- 2026-09-05：Q19 用户确认所有资源 write 包含同资源 read。Q20、Q21 未确认：继续解释邀请权限与用户列表解耦，并按用户请求查阅 Kubernetes、Azure、AWS 的官方授权委派文档；未实施变更。

- 2026-09-05：RBAC 讨论确认统一 resource.read/write，并将角色管理和用户角色修改纳入可委派写权限。已解释前端菜单、路由、操作可见性与后端授权的职责；尚未实施，剩余授权边界继续讨论。

- 2026-09-05：用户在产品调研后确认增加默认邮件语言，并调用 grill-with-docs。创建讨论记录和领域术语；本轮问题的推荐答案均待用户确认，不能当作已批准的实现要求。
- 2026-09-05：用户确认 Q1 覆盖三类邮件、Q2 采用可委派的查看与管理权限；对 Q3 强调需要专门的系统设置页面，以容纳后续更多系统设置。应用代码未修改。
- 2026-09-05：用户确认 Q4 采用独立系统设置页面内的邮件 Card，提出通过该 Card 配置 SMTP；Q5 人工重发使用最新语言；Q7 显式保存和草稿、Q8 乐观锁均同意。Q6 重新讨论是否将邮件配置纳入初始化，旧初始语言建议暂不作最终决策。
- 2026-09-05：用户确认 Q9 SMTP 本轮一起做；Q10 提议在首页统一展示 Warning，将邮件未配置作为其中一条。已只读核实首页及 SMTP 流程；当前仍为讨论阶段。
- 2026-09-05：用户确认 Q11、Q13、Q15；Q12 明确未配置时提示联系管理员；Q14 明确尚未上线，无需过渡。用户提出先讨论 RBAC 复杂度，邮件配置的剩余问题暂缓，尚未批准任何授权模型变更。
