# 管理员验证码登录 + 内部邮箱密码登录

## 使用方式

- 管理员：Access 策略中的外部邮箱（例如 `1941109171@qq.com`）通过 Cloudflare 验证码登录，查看和管理全部邮箱。
- 内部邮箱：管理员在 Mailboxes 页面点击邮箱旁的“密码”，设置独立密码。该邮箱通过 `/login` 登录后，仅访问自己邮箱的邮件、附件、设置及 AI 会话。
- 密码至少 12 个字符，最多 128 个字符。管理员只能设置或重置，无法查看旧密码。停用密码登录不会删除邮件。
- 重置、停用和退出登录会撤销相关会话。重置或退出时会断开该邮箱现有的 AI 连接，其他会话可在仍有效时重连。
- 同一个邮箱的管理员与邮箱用户共享该邮箱 AI 聊天记录。
- MCP 是管理员功能；内部邮箱账号不能连接 MCP。
- 左侧底部“邮箱设置”只管理当前邮箱：显示名称、固定自动回复、转发和密码。邮箱账号修改自己的密码需输入原密码；成功后该邮箱全部密码登录会话失效，需重新登录。管理员仍可设置、重置或停用密码登录。
- 联系人与右上角“系统设置”仅管理员可见，接口也拒绝邮箱账号访问。系统设置中的 AI 自动回复草稿开关和提示词作用于全部邮箱；语言选择仍对所有用户开放，只影响当前浏览器。

## 单网址部署

一个网址即可，例如 `https://mail.ordoeden.com`（示例，部署时使用你的实际网址）：

- `/login`：普通用户输入邮箱和密码，也可以点击“管理员登录”。
- `/auth/admin/session`：由 Cloudflare Access 保护，验证管理员邮箱后，Worker 签发自己的管理员会话并跳回 `/`。
- `/`、邮件 API 和 AI 连接：由 Worker 校验应用会话，无需每个请求都再次经过 Access。

### Cloudflare 中的一次性配置

1. 先部署本次代码，保留现有 R2、邮箱 Durable Object、邮件绑定、实际 `DOMAINS`/`EMAIL_ADDRESSES` 和 secrets。初次部署密码登录功能时，`AUTH` 绑定及 `v4` 迁移必须一同部署；如果已经有 `AUTH`，会话表会自动补上角色字段，已有会话仍为普通邮箱权限，不需要新建数据库或新迁移标签。
2. 在 Zero Trust → Access → Applications 配置自托管应用，将保护范围设为 **你的域名 + 路径 `auth/admin/session`**。Allow 策略只保留管理员邮箱，登录方式启用 One-time PIN。不要把整个 `/auth/*`、`/login`、邮件页面或普通 API 都纳入管理员 Access 验证。
3. Worker 的 `POLICY_AUD` 设为这个 Access **应用的 Application Audience (AUD)**，不是 Allow 策略 ID；`TEAM_DOMAIN` 设为对应团队的 HTTPS 地址。
4. `ADMIN_ORIGIN` 设为网站本身的 HTTPS origin，例如 `https://mail.ordoeden.com`，不要加路径。登录按钮会自动指向 `/auth/admin/session`；未设置时默认使用当前网址，建议生产环境明确设置以限定管理员身份的接收域名。
5. 确认新路径应用和新代码已就绪后，再调整旧的整站 Access 配置，让普通入口不被管理员登录拦截。检查是否还有通配域名或整站 Access 应用覆盖它。不要给管理员路径设置 Bypass。
6. 无痕访问 `/login`，点击“管理员登录”，使用管理员邮箱验证码进入。为各邮箱设置密码后，退出，再用内部邮箱密码验证隔离。

Git 推送只会在已连接 Workers 自动构建部署时发布代码，不会修改 Zero Trust Access 的应用、路径或策略。使用 `workers.dev` one-click Access 时，需要先在你的控制台确认能否将保护范围改成上述路径；如果不能，可绑定**一个**自定义域名并为该域名配置路径应用，用户仍只使用一个网址。

管理员会话使用 HttpOnly、Secure、SameSite=Strict cookie，最多 8 小时且不会晚于用于登录的 Access 令牌到期。退出会撤销应用会话并跳到 Cloudflare Access 的退出地址；管理员政策变化不会主动撤销已经签发的应用会话，其最晚在上述到期时间失效。管理员与邮箱账号切换时，原应用会话会撤销，身份不会因残留 cookie 自动提升。

管理员会话可访问 MCP，但外部 MCP 客户端不会自动继承浏览器 cookie。现有通过 Access assertion 认证的客户端仍支持；若需要让其走 Access 登录，需单独配置对应的 MCP 保护路径和匹配的应用 AUD。

## 可选：两个网址，同一个 Worker

保留现有 `agentic-inbox.…workers.dev` 网址及其 one-click Access，作为管理员入口。
另外选择一个尚未使用的自定义域名，例如 `mail.ordoeden.com`，绑定到**同一个 Worker**，作为内部邮箱入口。此名称只是示例，部署前确认未被其他服务占用。

1. 先部署本次代码及 `v4` 迁移。它新增 `AUTH` Durable Object，不更改已有邮箱数据库。
2. Worker → Settings → Variables and Secrets：保留正确的 `POLICY_AUD` 和 `TEAM_DOMAIN`，并设置 `ADMIN_ORIGIN` 为管理员入口的完整 HTTPS origin，例如 `https://agentic-inbox.1941109171.workers.dev`，不要附加路径。
3. Access 中对应管理员应用的 **Allow 策略只保留管理员邮箱**。该应用的允许用户都会成为管理员，不能把普通成员加在这里，也不要添加 Everyone 或服务令牌规则。
4. 在 Worker → Settings → Domains & Routes 添加内部邮箱入口的 Custom Domain。这个入口由应用密码登录保护，不能套用现有整站管理员 Access 应用，否则普通用户仍会先被 Access 拦住。确认 Access 没有其他通配域名应用覆盖它。
5. 用管理员入口登录。在邮箱列表创建 `contact@ordoeden.com`、`gidon@ordoeden.com`（如尚未创建），分别设置密码。Worker 的 `DOMAINS` 应包含 `ordoeden.com`。若设置了 `EMAIL_ADDRESSES`，这些邮箱也需包含在其中。
6. 用无痕窗口打开内部入口 `/login`，分别验证两个账号各自只能访问自己的邮箱。登录页“管理员登录”按钮会跳转到 `ADMIN_ORIGIN` 下的 `/auth/admin/session`。

两个网址使用同一份存储，但 cookie 限定在各自域名，不互相共享。无需复制 Worker 或邮件数据，也无需将内部地址加入 Access。

**不要先移除当前整站 Access 再部署旧版本。先部署带应用鉴权的新版本，最后开放内部入口。** 现有管理员入口保持受 Access 保护。

本仓库的 `DOMAINS` 已设为 `ordoeden.com,vibeapi.cc`，与当前使用的邮箱域名一致。首页展示和新建邮箱的域名白名单都读取此配置；部署前确认线上变量与实际邮件路由一致，并保留已有绑定和 secrets。修改此配置不会重命名或删除已有 `@example.com` 邮箱，已有邮件和账号仍保留。新增 AUTH 绑定和 v4 迁移必须随代码一起部署。

## 会话和维护

应用会话仅在服务端存储令牌摘要。管理员会话与普通邮箱会话具有独立角色，普通邮箱密码的重置和停用不会授予管理员权限。

密码使用 scrypt（N=16384, r=8, p=5）和独立随机盐存储在 AUTH 中；邮箱配置/API 不包含密码摘要。会话有效期 8 小时，浏览器使用 HttpOnly、Secure、SameSite=Strict cookie，服务端只存储会话令牌摘要。

每个邮箱每 15 分钟最多 10 次登录尝试，每个来源 IP 最多 50 次；超过后等待窗口结束。应用内管理密码，无需额外登录服务或邮件验证码服务。对外开放前确认 Worker 计划的 CPU 限额可以承载 scrypt；本地运行时兼容性已测试，线上负载和 CPU 配额需在目标计划确认。大量用户时可按邮箱拆分认证存储，并在 Cloudflare 配置额外的入口限速。

Access 管理员 token 按 issuer、audience、签名、有效期和用户身份验证。管理员 Access 策略变化后的生效时间遵循 Access 会话机制。内部邮箱未设置密码时默认不能登录。

### 管理员首次验证码提示过期

先区分提示发生在哪一步：本应用不签发或校验管理员邮箱验证码。登录页只导航到 `/auth/admin/session`，Cloudflare Access 完成 One-time PIN 校验后才把已签名的身份令牌交给 Worker。

- 如果提示出现在 Cloudflare Access 的验证码表单中，记录失败时间、页面域名和完整提示，并检查 Zero Trust 的 Access 登录日志。用一个新开的无痕窗口、单个登录页面、一次发送和该次邮件中的验证码复测，避免多页面或重发造成验证码与登录流程混用；同时检查是否有旧的整站或通配域名 Access 应用覆盖管理员路径。上述项目是排查方向，不能仅凭“第一次过期”判定具体原因。
- 如果验证码提交后已经回到 `/auth/admin/session`，并显示 `Invalid or expired Access token`，这是应用拒绝了 Access 身份令牌，不等于邮箱验证码过期。核对该路径实际命中的 Access 应用与 Worker 的 `TEAM_DOMAIN`、`POLICY_AUD`、`ADMIN_ORIGIN` 配置，以及 Access 会话是否已经到期。不要通过关闭验签或延长已过期令牌的有效期绕过错误。
- 提供排查证据时只保留时间、域名、路径及提示文字；隐藏验证码、Cookie、JWT 和 URL 查询参数中的登录状态。应用的本地认证测试不访问 Cloudflare 的真实验证码页面，因此不能据此认定 One-time PIN 问题已经修复。

## 本地验证

```sh
npm run typecheck
npm run build
npm run test:auth
```

集成测试使用本地 Miniflare、测试邮箱与临时存储，不连接生产邮箱、不发送邮件。`DEV_ADMIN_EMAIL` 仅在开发模式可用；生产构建忽略它。
