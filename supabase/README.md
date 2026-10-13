# Supabase 接入

本项目使用 `https://vghfkcqssvudccsnfwon.supabase.co`，业务对象都以 `yizhestart_` 开头。前端使用 publishable key；无需也不要把数据库密码、secret key 或 service-role key 放进前端。切换 Supabase 项目不需要改动初始化 SQL，在目标项目执行一次即可；旧项目的数据和账号不会自动迁移。

## 初始化（执行一次）

1. 在上述 Supabase 项目的 **SQL Editor** 新建查询，粘贴并执行 [`yizhestart_init.sql`](./yizhestart_init.sql) 的完整内容。
2. 脚本只创建 `public.yizhestart_documents`、`public.yizhestart_save_document(jsonb, integer)` 和带前缀的约束、索引、RLS 策略。全部在同一事务中执行；发现同名对象就报错回滚，不覆盖同名对象。成功后无需重复运行。**不要执行 `supabase db reset`、全库迁移推送或删除现有对象。**
3. 在网页点击“登录”，切换到“注册”，使用自己的邮箱和密码创建 Yizhe Start 用户，再登录。用户无需 Supabase 平台管理账号。服务端不要求邮件验证时注册后直接登录；要求验证时页面提示查收验证邮件。项目中已配置给定 URL 和 publishable key，本地或构建时可通过 `.env.local` 中的 `VITE_SUPABASE_URL`、`VITE_SUPABASE_PUBLISHABLE_KEY` 覆盖，格式见根目录 `.env.example`。
4. 登录后，收藏和偏好从当前账号的云端文档加载。初次登录的云端目录为空；需要迁移时，在“账号”中点击“迁移本地收藏到云端”，确认后写入。迁移会替换当前账号的云端目录，先导出云端备份；浏览器原有本地收藏不被修改。

## 共用数据库的边界

- 表、函数、策略、约束以及主键索引均使用 `yizhestart_` 前缀。脚本不读取、改动其他项目的表、函数、触发器、Auth 用户或全局权限，不安装扩展、不修改 Realtime publication，不添加 `auth.users` 触发器或外键。
- **Supabase Auth 的终端用户与 Supabase 平台管理账号是两种账号。**本网站通过注册表单创建终端用户，密码验证与会话由 Supabase Auth 处理，业务表不保存密码。如果同一 Supabase 项目承载多个应用，它们仍共享 Auth 账号池和登录配置；注册也会执行该项目已有的 Auth hooks / `auth.users` 触发器。脚本不新增或修改这类 hooks，不改动验证策略、邮件模板或全局设置。
- 登录 session 在浏览器使用带目标项目主机名的独立键 `yizhestart_auth_<主机名>`，更换 Supabase 项目后不会误用旧项目会话。退出使用 `scope: local`，只结束当前会话，不全局退出其他应用会话。同一 Supabase 项目内账号的密码和验证状态仍然共享；数据库容量、请求额度和服务可用性也共享。
- 未登录继续使用原来的本地收藏；登录后只操作当前账号的云端收藏。退出后恢复本地收藏，云端内容不会写入匿名本地目录。

## 数据与权限

`yizhestart_documents` 每个账号一行，`user_id` 为主键；`payload` 原子保存现有 `schemaVersion: 1` 收藏树与偏好，`revision` 是递增版本，`updated_at` 是保存时间。无需拆分目录和书签，可保持整棵树的保存事务。

搜索历史保存在同一行 `payload.searchHistory` 中，不需要新增表或修改现有 SQL。每条记录包含 `query`、`engine` 和 `searchedAt`（Unix 毫秒）；保留最近 100 个不同关键词，每个最多 500 个字符。重复搜索会更新该词的引擎和时间；长于上限的搜索仍正常打开，只是不记录。旧数据没有该字段时按空历史读取。登录后历史随账号文档保存、同步和清空；未登录时只保存在浏览器。导出备份包含历史，导入、迁移会完整替换历史。

历史写入使用原有保存函数和权限，支持版本冲突后在最新文档上重放历史操作，保留其他设备的收藏修改。联想词仅用于候选列表，只有真正提交的关键词进入历史。联想查询会发送到相应的建议提供方（Bing，或 Google；Yandex 模式使用 Bing 候选），请求失败不影响正常搜索。

匿名角色没有读取或写入权限。登录用户通过 RLS 只能读取 `auth.uid() = user_id` 的行，没有直接插入、更新、删除权限。写入必须调用保存函数；函数明确从 JWT 获取用户 ID、固定空 `search_path`，只操作本项目的表。客户端不能指定其他账号。新建时传版本 0，更新时传刚读取的版本，不一致报错，避免不同设备静默覆盖。

同步在登录、窗口重新获得焦点、手动同步时执行，页面可见时每 30 秒检查一次。保存会等待云端成功，失败保留表单及原状态；版本冲突会重新读取最新收藏，保留正在编辑的文本，需检查后再保存。离线时仍可查看已加载的内容和导出备份，但不提供离线写入队列。服务端约束限制文档格式和 10 MB 大小，前端执行完整树结构校验。

## 注册、Google 登录与浏览器密码保存

邮箱注册默认在网页中提供，密码至少 8 个字符，确认密码必须一致；服务器的密码策略仍会再次验证。登录用注册的邮箱密码。当前项目允许注册且默认直接生成会话；若以后启用邮箱验证，应在 **Authentication → URL Configuration → Redirect URLs** 添加 `https://yizhe821.github.io/yizhe-start/`，本地调试可另加 `http://127.0.0.1:5173/yizhe-start/`。若同时修改 Site URL，应先确认该 Supabase 项目是否还供其他应用使用。邮件服务配置属于服务端管理，前端不会更改。

Google 接入代码已准备好。每次打开账号面板时读取公开 provider 配置，`external.google` 为 true 才显示 Google 登录按钮；未配置时邮箱注册登录照常工作。启用流程：

1. 在 Google Cloud / Google Auth Platform 创建 **Web application** OAuth 客户端，并配置应用名、受众及基本身份 scopes（openid、email、profile）。授权 JavaScript origin 为 `https://yizhe821.github.io`。
2. Google 的 **Authorized redirect URI** 填入 `https://vghfkcqssvudccsnfwon.supabase.co/auth/v1/callback`。
3. 在 Supabase **Authentication → Sign In / Providers → Google** 填入 Client ID、Client Secret 并启用。Client Secret 只保存在 Supabase 后台，不写前端、Vite 环境变量或仓库。
4. 在 Supabase 的 Redirect URLs 允许 `https://yizhe821.github.io/yizhe-start/`。无需改 SQL 或重新发布前端，重新打开账号面板即可显示入口。

邮件验证和 Google 授权都会返回起始页根路径，客户端自动接收回调会话并加载该用户的收藏，成功后从地址栏清除 token。Google 登录由 Google 管理账号凭据，本网站不会接收 Google 密码。

邮箱表单使用独立的标准 HTML form、有关联 label 的稳定字段名、`autocomplete=username/current-password/new-password`，支持 Chrome 自动填充。邮箱登录或注册并成功获得会话后，若浏览器提供 `PasswordCredential`，调用 `navigator.credentials.store` 请求浏览器保存。这个请求不阻塞登录，失败也不影响收藏。密码仅交给身份验证服务和浏览器密码管理器，不写入 localStorage、导出备份或业务表。

网站无法强制弹出 Chrome 保存密码界面。是否提示取决于用户的 Google 密码管理工具设置、该站点是否在“拒绝保存”列表、是否已保存相同凭据以及浏览器模式。自动化测试验证凭据调用与表单属性，无法替用户验收真实浏览器的保存弹窗。官方参考：[Chrome Credential Management API](https://developer.chrome.com/blog/credential-management-api)、[登录表单最佳实践](https://web.dev/articles/sign-in-form-best-practices)。

## 验证与上线

执行 `npm run typecheck`、`npm test`、`npm run build`、`npm run test:e2e`。业务测试用本地内存 PostgreSQL 运行真实初始化 SQL，验证匿名拒绝、账号隔离、写入限制、版本冲突和对原有对象的保留；浏览器测试模拟 Supabase API，不往真实数据库写测试数据。

上线前必须执行初始化 SQL，并以真实账号检查登录、保存、刷新与另一设备读取。当前 publishable key 没有执行 DDL 的能力，前端不会自动建表。迁移未执行时网页会显示“云端存储尚未初始化”，本地收藏仍可使用。CI 默认使用源代码中的公开配置；若要更换数据库，应在构建步骤提供对应的 Vite 环境变量。

官方参考：[API keys](https://supabase.com/docs/guides/getting-started/api-keys)、[RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)、[数据库函数](https://supabase.com/docs/guides/database/functions)、[密码登录](https://supabase.com/docs/guides/auth/passwords)。
