# Yizhe Start 第一版开发文档

## 目标与边界

面向个人使用的浏览器启动页或主页，采用 iOS 视觉，支持桌面鼠标、键盘和手机触摸。静态页面托管在 GitHub Pages，云端账号与收藏使用 Supabase。

当前实现搜索、三种引擎切换、实时本机日期时间、书签及嵌套文件夹管理、移动、同级排序、本地保存、Supabase 邮箱密码登录、按账号的云端保存与同步、导入导出与主题设置。拖拽、搜索建议、天气、壁纸服务不在范围内。

未登录时收藏按浏览器来源保存；登录同一账号后，本地部署页面和托管页面共享该账号的云端收藏。云端与匿名本地目录独立，迁移需明确确认。

## 技术架构

Vue 3 Composition API、TypeScript、Vite、Tailwind CSS 4 和 Konsta UI 5.5.0。使用 npm 和 lockfile，CI 为 Node.js 22，本地最低 Node.js 22.12，兼容 Node.js 24。

- 根容器显式选择 Konsta iOS 主题，主题状态与文档根节点的深色模式同步。
- Tailwind 通过 `@tailwindcss/vite` 编译；主样式导入 `tailwindcss` 与 `konsta/vue/theme.css`。
- 页面骨架、日期时间、搜索引擎选择、文件夹卡片和弹出面板使用自定义布局。搜索、表单容器、按钮、列表、确认与提示复用 Konsta。
- `src/domain` 管理纯业务逻辑与存储事务；`src/composables` 连接 Vue 状态、本地存储和系统主题；`src/components` 提供可复用视图。
- 不引入 Router、Pinia、Ionic 或 Framework7，不通过 CDN 加载字体、图标、脚本或书签 favicon。
- 界面和引擎品牌图标通过 `@tabler/icons-vue` 的命名导入使用，生产构建移除未使用图标，随静态页面离线加载；不手写 SVG 路径。

## 行为约定

### 搜索

支持 Bing、Google、Yandex，默认 Bing，成功保存后记住选择。查询去除首尾空白，空输入不跳转；使用 URL 查询参数编码，网址字符串也作为关键词。结果在新标签页打开。

搜索框内部左侧显示当前引擎的 Tabler 品牌图标，点击展开选择列表。按向下箭头进入列表，Tab 选择、Enter 确认；Escape、外部点击或焦点离开时关闭。上方按浏览器本机时区显示 24 小时时间（含秒）和中文日期，每秒更新，切回页面时立即刷新。

Enter 或按钮提交。输入法组合期间的 Enter 不提交，包含 `isComposing` 和 229 键码兼容处理。

### 目录操作

- 根目录允许文件夹和书签，文件夹允许任意层级嵌套。
- 新条目追加到当前目录末尾。名称去除首尾空白，不能为空；同名条目合法。
- 书签网址未提供协议时补全 HTTPS；仅允许 HTTP/HTTPS，不接受包含账号密码的 URL。
- 书签在新标签页打开。文件夹在居中面板中浏览，进入下级时复用该面板。
- 面包屑与上一级操作提供路径导航；超过三层时折叠中间路径。
- 菜单提供编辑、移动、前移、后移、删除；移动目标选择器逐层导航，支持根目录。
- 禁止移动到自身、后代、书签或不存在的目录。移动到原目录不改变数据。
- 顺序在文件夹和书签混合列表中定义。前移或后移只交换同级条目。
- 删除文件夹显示整棵子树的文件夹及书签数量，确认后删除，取消保持原状。确认期间子树成员变化则要求重新确认。
- 当前浏览目录消失或被移走时退到仍存在的上级；根目录显示在首页。

### 弹出层

背景不可交互并锁定滚动，根页面使用 `scrollbar-gutter: stable` 保留滚动条占位，避免左右跳动；焦点限制在最上层浮层中。Escape 仅处理最上层；编辑未保存时先确认放弃，取消放弃后保留内容。关闭后恢复至触发控件，控件已消失则回到主页链接。弹层继承 iOS 主题，避免 Teleport 后主题类失效。

## 数据与存储

Supabase 接入约定和初始化步骤见 [supabase/README.md](./supabase/README.md)。业务表、函数、约束、策略、索引必须使用 `yizhestart_` 前缀，不能修改其他项目对象或全局配置。云端通过 `yizhestart_save_document` 校验版本后原子保存整份数据，直接写表被禁止。登录后每 30 秒、窗口获得焦点及手动操作时拉取更新；未登录保留以下本地事务。

存储键为 `yizhe-start:data:v1`。数据文档包含 `schemaVersion: 1`、`nodes` 和 `preferences`。

| 类型 | 字段 |
| --- | --- |
| 公共节点 | `id`、`kind`、`title`、`parentId`、`order` |
| 文件夹 | `kind: folder` |
| 书签 | `kind: bookmark`，增加 `url` |
| 偏好 | `searchEngine: bing/google/yandex`；`appearance: system/light/dark` |

新 ID 使用 UUID。`parentId` 为 null 表示根目录，否则必须指向文件夹。`order` 为非负安全整数，同一父节点下不得重复；合法排序间隙可导入，追加操作取最大值之后的位置。

业务接口包括 `saveEntry`、`moveEntry`、`deleteEntry`、`reorderEntry`、`children`、`descendants`、`pathTo`、`validateData` 和 `searchUrl`。写操作返回新数据，不修改原数据；校验使用迭代遍历以支持深层目录。

持久化先验证完整结果，再一次写入 localStorage，成功后更新共享状态。失败时保留原数据及表单，提供提示。损坏或未知版本数据不自动覆盖，保留原文并提供下载、导入和重置入口。

导出包含整个目录、排序、偏好，文件名带本地日期。导入上限 10 MB，校验版本、字段、ID、父关系、无环关系、排序、偏好和 URL，再展示数量并请求确认，采用完整替换。错误文件不会改变现有数据。

监听同源其他标签页的 storage 事件，更新已保存数据；编辑表单文本保持不变，保存时重新验证目标是否存在、类型和父目录是否改变。

## 验证

`npm run typecheck` 检查 Vue 和 TypeScript；`npm test` 验证树形操作、非法导入、URL 编码、深层目录及存储事务。`npm run build` 生成静态产物。

`npm run test:e2e` 使用生产预览及本机 Chrome（非 Windows 使用 Playwright Chromium），验证嵌套增删改、移动、排序、删除确认、焦点恢复、未保存编辑、输入法、搜索引擎、主题、异常数据、跨标签页同步、写入失败及 360/768/1440px 布局。

## GitHub Pages 部署

### 部署方式与首次配置

项目采用 **GitHub Actions 构建并发布到 GitHub Pages**，工作流文件为 `.github/workflows/deploy.yml`。源码仓库为 [yizhe821/yizhe-start](https://github.com/yizhe821/yizhe-start)，线上地址为 [Yizhe Start](https://yizhe821.github.io/yizhe-start/)。该仓库已启用此发布方式。

重新建立仓库时，在 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**，保留项目已有工作流。Vite 的 `base` 必须与项目站点路径一致，当前为 `/yizhe-start/`。更换仓库名时同步修改；使用根路径自定义域名时改为 `/`。

工作流在 `main` 收到推送或手动触发时运行。`build` 作业使用 Node.js 22，依次执行 `npm ci`、`npm run typecheck`、`npm test`、`npm run build`，将 `dist` 上传为 Pages 产物；`deploy` 作业在构建成功后发布该产物。发布环境为 `github-pages`，所需权限已在工作流中配置：`contents: read`、`pages: write`、`id-token: write`。此方式由 Actions 管理构建产物，无需手动上传或提交 `dist`。

当前 CI 执行类型检查和业务测试，**不执行 `npm run test:e2e`**；页面或交互发生变化时，应在本地完成浏览器测试后再发布。

### 每次编写或修改代码后的发布流程

开发交付流程包含本地验证、提交推送、部署确认和线上验收。仅编辑文件、运行 `npm run build` 或创建本地提交，都不会更新线上网站；未推送的代码也不会被手动部署。

1. 完成代码修改后运行本地检查。页面或交互变化时，再运行端到端测试；该测试使用前一步生成的生产构建。

   ```sh
   npm run typecheck
   npm test
   npm run build
   # 页面或交互变化时执行
   npm run test:e2e
   ```

2. 查看变更，提交本次准备发布的文件，再推送到 `main`。以下文件列表仅为示例，应按本次修改调整；其他开发分支须先合并到 `main` 才会自动发布。

   ```sh
   git status
   git diff
   git add -- src/App.vue src/style.css
   git commit -m "Describe the change"
   git push origin main
   ```

3. 打开仓库 [Actions](https://github.com/yizhe821/yizhe-start/actions)，进入此次提交对应的 **Publish GitHub Pages** 运行记录。确认提交与本次推送一致，并等待 `build` 和 `deploy` 两个作业均显示成功。推送成功只代表源码上传完成，部署成功才代表线上版本已更新。

4. 打开 [线上站点](https://yizhe821.github.io/yizhe-start/)，确认修改可见，检查刷新、搜索、书签操作、明暗主题及窄屏布局中与本次改动相关的行为。代码提交、部署结果和线上验证结果应在交付时说明。

个人收藏在未登录时保存在浏览器 localStorage，登录后保存在 Supabase 当前账号文档中，不随源码上传。不要提交个人导出备份；`exports/` 已加入忽略规则。首次启用云端存储须先在 SQL Editor 执行本项目初始化 SQL，再发布并以真实账号验收。

### 手动部署与失败排查

- 手动部署：在 **Actions → Publish GitHub Pages → Run workflow** 选择 `main` 并运行，用于重新发布最新已推送代码。
- 自动部署未触发：检查提交是否已推送到 `main`，工作流是否存在且仓库 Actions 已启用。
- 构建失败：打开失败步骤的日志，修复依赖安装、类型检查、测试或构建错误后重新提交推送；构建失败时不会进入发布作业。
- 发布失败：检查 Pages 的 Source 是否为 GitHub Actions、工作流发布权限及 `github-pages` 环境是否限制 `main`。修正后重新运行工作流。
- 资源 404：检查 Vite `base`、仓库站点路径和构建资源引用，再重新构建发布。
- 部署成功但页面仍旧：先核对该运行记录对应的提交，再强制刷新或用新的浏览器会话检查；未推送的本地改动不会出现在网站上。

上线后以用户实际宽带、手机网络验证大陆访问；不达标时迁移相同静态产物，不改动业务架构。

部署配置参考：[GitHub Pages 发布源](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)、[自定义 Pages 工作流](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。

参考：[Konsta Vue 安装](https://konstaui.com/vue/installation)、[Searchbar](https://konstaui.com/vue/searchbar)、[Tailwind Vite](https://tailwindcss.com/docs/installation/using-vite)、[Vite Pages 部署](https://vite.dev/guide/static-deploy.html#github-pages)。
