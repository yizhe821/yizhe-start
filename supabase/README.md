# Supabase 接入

本项目使用 `https://vghfkcqssvudccsnfwon.supabase.co`，业务对象都以 `yizhestart_` 开头。前端使用 publishable key；无需也不要把数据库密码、secret key 或 service-role key 放进前端。切换 Supabase 项目不需要改动初始化 SQL，在目标项目执行一次即可；旧项目的数据和账号不会自动迁移。

## 初始化（执行一次）

1. 在上述 Supabase 项目的 **SQL Editor** 新建查询，粘贴并执行 [`yizhestart_init.sql`](./yizhestart_init.sql) 的完整内容。
2. 脚本只创建 `public.yizhestart_documents`、`public.yizhestart_save_document(jsonb, integer)` 和带前缀的约束、索引、RLS 策略。全部在同一事务中执行；发现同名对象就报错回滚，不覆盖同名对象。成功后无需重复运行。**不要执行 `supabase db reset`、全库迁移推送或删除现有对象。**
3. 用现有、已验证的 Supabase 邮箱和密码账号登录网页。项目中已配置给定 URL 和 publishable key，本地或构建时可通过 `.env.local` 中的 `VITE_SUPABASE_URL`、`VITE_SUPABASE_PUBLISHABLE_KEY` 覆盖，格式见根目录 `.env.example`。
4. 登录后，收藏和偏好从当前账号的云端文档加载。初次登录的云端目录为空；需要迁移时，在“账号”中点击“迁移本地收藏到云端”，确认后写入。迁移会替换当前账号的云端目录，先导出云端备份；浏览器原有本地收藏不被修改。

## 共用数据库的边界

- 表、函数、策略、约束以及主键索引均使用 `yizhestart_` 前缀。脚本不读取、改动其他项目的表、函数、触发器、Auth 用户或全局权限，不安装扩展、不修改 Realtime publication，不添加 `auth.users` 触发器或外键。
- **Supabase Auth 的账号池和登录配置属于整个 Supabase 项目，共用数据库并不能将 Auth 分成两个独立项目。**本网站提供已有账号登录，没有注册、改密、删除账号入口，以免操作共享账号、触发另一项目已有的注册逻辑。需要新账号时，应先检查该 Supabase 项目已有的 Auth hooks / `auth.users` 触发器，再由管理员创建。不要为了本网站修改另一项目的邮件模板、Site URL、验证或密码策略。
- 登录 session 在浏览器使用带目标项目主机名的独立键 `yizhestart_auth_<主机名>`，更换 Supabase 项目后不会误用旧项目会话。退出使用 `scope: local`，只结束当前会话，不全局退出其他应用会话。同一 Supabase 项目内账号的密码和验证状态仍然共享；数据库容量、请求额度和服务可用性也共享。
- 未登录继续使用原来的本地收藏；登录后只操作当前账号的云端收藏。退出后恢复本地收藏，云端内容不会写入匿名本地目录。

## 数据与权限

`yizhestart_documents` 每个账号一行，`user_id` 为主键；`payload` 原子保存现有 `schemaVersion: 1` 收藏树与偏好，`revision` 是递增版本，`updated_at` 是保存时间。无需拆分目录和书签，可保持整棵树的保存事务。

匿名角色没有读取或写入权限。登录用户通过 RLS 只能读取 `auth.uid() = user_id` 的行，没有直接插入、更新、删除权限。写入必须调用保存函数；函数明确从 JWT 获取用户 ID、固定空 `search_path`，只操作本项目的表。客户端不能指定其他账号。新建时传版本 0，更新时传刚读取的版本，不一致报错，避免不同设备静默覆盖。

同步在登录、窗口重新获得焦点、手动同步时执行，页面可见时每 30 秒检查一次。保存会等待云端成功，失败保留表单及原状态；版本冲突会重新读取最新收藏，保留正在编辑的文本，需检查后再保存。离线时仍可查看已加载的内容和导出备份，但不提供离线写入队列。服务端约束限制文档格式和 10 MB 大小，前端执行完整树结构校验。

## 验证与上线

执行 `npm run typecheck`、`npm test`、`npm run build`、`npm run test:e2e`。业务测试用本地内存 PostgreSQL 运行真实初始化 SQL，验证匿名拒绝、账号隔离、写入限制、版本冲突和对原有对象的保留；浏览器测试模拟 Supabase API，不往真实数据库写测试数据。

上线前必须执行初始化 SQL，并以真实账号检查登录、保存、刷新与另一设备读取。当前 publishable key 没有执行 DDL 的能力，前端不会自动建表。迁移未执行时网页会显示“云端存储尚未初始化”，本地收藏仍可使用。CI 默认使用源代码中的公开配置；若要更换数据库，应在构建步骤提供对应的 Vite 环境变量。

官方参考：[API keys](https://supabase.com/docs/guides/getting-started/api-keys)、[RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)、[数据库函数](https://supabase.com/docs/guides/database/functions)、[密码登录](https://supabase.com/docs/guides/auth/passwords)。
