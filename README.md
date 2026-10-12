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
- 收藏只保存在当前浏览器。JSON 导出和确认导入，导入上限 10 MB。
- 数据损坏时保留原文，可下载原始数据、导入有效备份或显式重置。
- 同源标签页同步，写入失败保留状态与表单。

删除文件夹会在确认后删除整棵子树，操作无法撤销，重要收藏请定期导出。清理浏览器站点数据会清除收藏；换域名或设备时通过备份迁移。

## GitHub Pages

仓库： https://github.com/yizhe821/yizhe-start

在仓库 Settings → Pages → Build and deployment 中选择 **GitHub Actions**。推送 `main` 后，工作流执行类型检查、业务测试和构建，再发布 `dist`。

默认站点地址： https://yizhe821.github.io/yizhe-start/

构建 `base` 为 `/yizhe-start/`，资源使用 Vite 管理的相对基址。换仓库名时同步修改 `base`；绑定根路径自定义域名时改为 `/`。网站首次上线后，应使用自己的宽带和手机网络实测大陆可达性。

个人书签不随代码上传。不要把自己的备份提交到仓库；`exports/` 已加入忽略规则。

完整开发约定见 [DEVELOPMENT.md](./DEVELOPMENT.md)，视觉与组件约定见 [DESIGN.md](./DESIGN.md)。
