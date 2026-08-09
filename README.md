# 烬天 · 本地小说阅读器

一个独立运行的 DOCX 长篇小说阅读器。文档在浏览器中解析，不会上传到服务器。

## 已支持

- 分集 DOCX 默认追加到现有小说
- 重复集数更新对应章节，不覆盖其他集
- 整本 DOCX 可选择替换当前目录
- 自动忽略“第一集·完”“本章完”等结束标记
- 正文、线索和阅读位置保存在浏览器 IndexedDB
- 每集人物、地点、境界、时间和伏笔可手动编辑

线索目前不会调用 AI，也不会将正文发送到外部服务。清除浏览器的站点数据会同时删除已保存的阅读器数据，请保留原始 DOCX 文件。

## 启动

```bash
npm install
npm run dev
```

打开 `http://localhost:3000/reader`。

## 发布小说

将整本 DOCX 或包含多个分集 DOCX 的文件夹转换为网站可读取的分章 JSON：

```bash
npm run import-novel -- "/路径/烬天.docx" jintian 烬天
# 或
npm run import-novel -- "/路径/烬天分集文件夹" jintian 烬天
```

转换结果位于 `public/books/jintian/`。提交并推送后，网站会发布这些章节；读者的阅读进度仍保存在各自浏览器中。更新小说时再次运行同一命令即可。

### 日常分集更新

本机已经可以使用快捷流程：

1. 将新一集 DOCX 放进 `/Users/qiyanjin/Downloads/烬天/`。
2. 确认标题采用 `第三集：标题` 或 Word“标题 2”。
3. 运行：

```bash
npm run publish-novel
```

该命令会依次扫描全部分集、更新公开章节、检查构建、创建 Git 提交、推送并触发 GitHub Pages。只想本地预览、不推送时使用 `npm run update-novel`。

原稿目录配置保存在不会提交到 GitHub 的 `novel.config.local.json`；移动原稿文件夹后，只需修改其中的 `sourceDirectory`。

## GitHub Pages

项目已包含 `.github/workflows/deploy-pages.yml`。推送至仓库的 `main` 分支后，在 GitHub 仓库的 **Settings → Pages → Source** 中选择 **GitHub Actions**。工作流会自动识别普通项目仓库与 `username.github.io` 仓库的路径差异。

## DOCX 格式建议

- 书名使用 Word“标题”样式
- 卷名使用“标题 1”
- 章节名使用“标题 2”
- 也支持 `第一章 标题`、`第一集 标题`形式的普通段落
