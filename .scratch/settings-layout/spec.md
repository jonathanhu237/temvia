# 系统设置布局优化

Status: implemented

## 目标与决策

用户认为原有系统设置页面不好看，同时不希望通过简单居中处理。确认采用左对齐、左侧分组标题与右侧表单的布局，并要求参考成熟产品的设置页做法。

- 内容上限 68rem，左侧分组标题 12rem，桌面使用两列；窄屏回到纵向排列。
- 一个页面主标题，邮件投递与操作历史两个设置组，以 Separator 分隔，移除大卡片及身份验证内框。
- 连接、身份验证、发件信息按间距和分隔线组织；端口、语言、安全方式、保留天数按内容长度限宽。
- 认证仍需显式保存，因此沿用复选框；只在启用认证时展示用户名和密码。关闭认证时沿用原有清空凭据草稿的行为。
- 两组独立保存，保留测试邮件弹窗、权限限制、校验及冲突处理。

## 调研依据

- Shopify Polaris React Layout: https://polaris-react.shopify.com/components/layout-and-structure/layout?example=layout-three-columns-with-equal-width
  - 历史设计模式中的 annotated layout 专用于设置页；参考其分组信息和设置内容的两栏结构，不引入其组件库。
- IBM Carbon Forms: https://carbondesignsystem.com/patterns/forms-pattern/
  - 按相关任务分组、按需展示字段、字段宽度反映内容长度，输入标签保留在字段上方。
- IBM Carbon Form: https://carbondesignsystem.com/components/form/usage/
  - 多列表单对齐到网格，字段与操作有清晰结构。

## 验证

- 所有源码在本地修改，rsync 单向同步至 Centaurus；无 Git 提交。
- Centaurus `pnpm check`、设置页已有 10 项测试通过。
- `pnpm lint` 无错误，仅已有 data-table.tsx TanStack Table warning。
- Centaurus Docker admin 生产构建通过，开发容器已更新。
- `visual-check.mjs` 在 Chromium 中使用拦截的 API 夹具检查真实构建页面；不修改开发环境设置，也不发送邮件。覆盖中文亮色 1440、英文亮色 1280、中文暗色 1440、中文窄屏 390、英文 768。
- 检查唯一 h1、页面无横向溢出、两组字段左边缘一致，以及认证字段显示/隐藏；截图已目视检查。
- 本地转发 http://127.0.0.1:25173/settings 返回 200，API http://127.0.0.1:28090/health 返回 ok。
- 浏览器验证侧重布局和认证展开；本轮未使用真实 SMTP 进行投递验证。

## 页内目录

用户确认增加右侧快速跳转目录。桌面 1280px 及以上显示“邮件投递 / 操作历史”两个锚点，目录 sticky 固定，滚动时同步 aria-current 与视觉高亮，滚动到底部时识别最后一组。点击后焦点移到分组标题，默认平滑滚动，尊重 reduced-motion 偏好。窄屏隐藏目录。

Centaurus 类型检查、lint（仅已有 warning）、生产构建通过。浏览器夹具检查扩展为两项跳转、手动滚动高亮、窄屏隐藏和原有表单对齐检查；包含普通动画与 reduced-motion。未对真实设置执行写入。
