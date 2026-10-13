# Yizhe Start

一个采用 iOS 控件风格的个人浏览器起始页。Vue 3 + TypeScript + Vite + Tailwind CSS 4 + Konsta UI 5.5.0。整体页面与桌面布局自定义，Konsta 提供基础控件。

## 使用与开发

需要 Node.js 22.12+（也支持 Node.js 24）和 npm。

```sh
npm ci
npm run dev
```

开发地址是 http://127.0.0.1:5173/yizhe-start/。

```sh
npm run typecheck
npm test
npm run build
npm run preview
```

端到端检查使用构建产物，Windows 默认调用已安装的 Google Chrome；其他系统需先安装 Playwright Chromium。

```sh
# 非 Windows 环境首次执行
npx playwright install chromium

npm run build
npm run test:e2e
```

## 功能

- Bing、Google、Yandex 搜索切换；Enter 和按钮提交；避免中文输入法误提交。
- 嵌套文件夹与书签的增删改、菜单移动及同级排序。
- 居中文件夹面板、面包屑和深层路径折叠。
- 浅色、深色、跟随系统；支持键盘焦点与减少动画模式。
- Bing 每日壁纸，带图片标题和来源署名；搜索框、时钟、收藏卡片和弹层采用适配明暗主题的磨砂材质。图片加载失败时回退为柔和渐变。
- 未登录时收藏保存在当前浏览器；在网页注册或登录自己的邮箱账号后，收藏和偏好按账号保存到云端，支持跨设备读取。
- 注册和登录表单支持浏览器密码保存与自动填充；后台启用 Google 登录后自动显示入口。
- 搜索框聚焦且为空时显示最近搜索；输入时刷新联想，列表贴着输入框浮动展开。支持上下键选择、Enter 搜索、Escape 关闭。
- 搜索历史保留最近 100 个不同关键词；登录后存入账号的数据库文档，未登录时保存在当前浏览器，支持清空和备份。
- JSON 导出和确认导入，导入上限 10 MB；支持确认迁移本地收藏到云端。
- 数据损坏时保留原文，可下载原始数据、导入有效备份或显式重置。
- 同源标签页同步，写入失败保留状态与表单。

删除文件夹会在确认后删除整棵子树，操作无法撤销，重要收藏请定期导出。清理浏览器站点数据会清除本地收藏；云端收藏可在重新登录后读取。

## Supabase 配置

项目已配置提供的 Supabase URL 和公开 publishable key。启用云端存储前，在该项目的 SQL Editor 执行一次 [初始化 SQL](./supabase/yizhestart_init.sql)。脚本只新增 `yizhestart_` 对象，不改动其他项目的数据或 Auth 配置。用户直接在网页创建 Yizhe Start 账号，无需注册 Supabase 平台管理账号；身份验证由 Supabase Auth 处理。已执行初始化 SQL 的项目不需要再次执行。

完整初始化步骤、权限和同步机制见 [Supabase 接入说明](./supabase/README.md)。

## 每日壁纸

发布前执行 `npm run wallpaper:update`，从 Bing 获取当天图片信息，仅保存 URL、标题和署名，图片直接从 Bing 加载。GitHub Pages 工作流每 4 小时自动刷新一次并发布；已打开的页面每 30 分钟及重新可见时检查更新，新图预加载成功后切换。元数据或图片请求失败不会阻断搜索和收藏。

本地开发可先运行 `npm run wallpaper:update`，再运行 `npm run dev`；仓库附带一个有效的图片信息快照用于网络不可用时回退。不需要修改 Supabase 表或执行新 SQL。

## GitHub Pages

仓库： https://github.com/yizhe821/yizhe-start

在仓库 Settings → Pages → Build and deployment 中选择 **GitHub Actions**。推送 `main` 后，工作流执行类型检查、业务测试和构建，再发布 `dist`。

编写或修改代码后的发布流程是：本地检查通过 → 提交修改 → 推送到 `main` → 等待 **Publish GitHub Pages** 工作流的 `build` 和 `deploy` 均成功 → 打开线上页面验收。仅修改本地文件、运行构建或创建本地提交，都不会更新线上网站。

部署由 [.github/workflows/deploy.yml](./.github/workflows/deploy.yml) 自动完成，无需手动上传 `dist`。也可以在仓库 **Actions → Publish GitHub Pages → Run workflow** 中选择 `main` 手动部署最新已推送版本。完整命令、首次配置和排查方式见 [开发文档的部署章节](./DEVELOPMENT.md#github-pages-部署)。

默认站点地址： https://yizhe821.github.io/yizhe-start/

构建 `base` 为 `/yizhe-start/`，资源使用 Vite 管理的相对基址。换仓库名时同步修改 `base`；绑定根路径自定义域名时改为 `/`。网站首次上线后，应使用自己的宽带和手机网络实测大陆可达性。

个人书签不随代码上传。不要把自己的备份提交到仓库；`exports/` 已加入忽略规则。

完整开发约定见 [DEVELOPMENT.md](./DEVELOPMENT.md)，视觉与组件约定见 [DESIGN.md](./DESIGN.md)。
