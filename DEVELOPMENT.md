# Yizhe Start 第一版开发文档

## 目标与边界

面向个人使用的浏览器启动页或主页，采用 iOS 视觉，支持桌面鼠标、键盘和手机触摸。托管在 GitHub Pages，不依赖运行时后端。

第一版实现搜索、三种引擎切换、书签及嵌套文件夹管理、移动、同级排序、本地保存、导入导出与主题设置。账号、同步服务、拖拽、搜索建议、天气、时钟、壁纸服务不在范围内。

本地部署页面和云端托管页面的数据互不共享，收藏按浏览器来源保存；换站点、设备或清理站点数据前先导出备份。

## 技术架构

Vue 3 Composition API、TypeScript、Vite、Tailwind CSS 4 和 Konsta UI 5.5.0。使用 npm 和 lockfile，CI 为 Node.js 22，本地最低 Node.js 22.12，兼容 Node.js 24。

- 根容器显式选择 Konsta iOS 主题，主题状态与文档根节点的深色模式同步。
- Tailwind 通过 `@tailwindcss/vite` 编译；主样式导入 `tailwindcss` 与 `konsta/vue/theme.css`。
- 页面骨架、文件夹卡片和弹出面板使用自定义布局。搜索、分段控件、表单容器、按钮、列表、确认与提示复用 Konsta。
- `src/domain` 管理纯业务逻辑与存储事务；`src/composables` 连接 Vue 状态、本地存储和系统主题；`src/components` 提供可复用视图。
- 不引入 Router、Pinia、Ionic 或 Framework7，不通过 CDN 加载字体、图标、脚本或书签 favicon。

## 行为约定

### 搜索

支持 Bing、Google、Yandex，默认 Bing，成功保存后记住选择。查询去除首尾空白，空输入不跳转；使用 URL 查询参数编码，网址字符串也作为关键词。结果在新标签页打开。

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

背景不可交互并锁定滚动；焦点限制在最上层浮层中。Escape 仅处理最上层；编辑未保存时先确认放弃，取消放弃后保留内容。关闭后恢复至触发控件，控件已消失则回到主页链接。弹层继承 iOS 主题，避免 Teleport 后主题类失效。

## 数据与存储

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

## 验证与发布

`npm run typecheck` 检查 Vue 和 TypeScript；`npm test` 验证树形操作、非法导入、URL 编码、深层目录及存储事务。`npm run build` 生成静态产物。

`npm run test:e2e` 使用生产预览及本机 Chrome（非 Windows 使用 Playwright Chromium），验证嵌套增删改、移动、排序、删除确认、焦点恢复、未保存编辑、输入法、搜索引擎、主题、异常数据、跨标签页同步、写入失败及 360/768/1440px 布局。

GitHub Actions 在 `main` 更新或手动触发时执行 `npm ci`、类型检查、业务测试、构建和 Pages 发布。`dist` 为产物目录，Vite 基址 `/yizhe-start/`，仓库 Pages 发布源为 GitHub Actions。

公网地址为 https://yizhe821.github.io/yizhe-start/ 。上线后以用户实际宽带、手机网络验证大陆访问；不达标时迁移相同静态产物，不改动业务架构。

参考：[Konsta Vue 安装](https://konstaui.com/vue/installation)、[Searchbar](https://konstaui.com/vue/searchbar)、[Tailwind Vite](https://tailwindcss.com/docs/installation/using-vite)、[Vite Pages 部署](https://vite.dev/guide/static-deploy.html#github-pages)。
