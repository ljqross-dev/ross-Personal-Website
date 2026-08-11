# ross-portfolio

Ross 个人作品集前台站点（静态站 + 轻量脚本）。

## 线上地址

- 正式站点：https://ross.hk/
- 管理后台：https://ross.hk/admin/（独立 CMS，不在本仓）
- 备案号：湘ICP备2026033513号-1

## 目录说明

| 路径 | 说明 |
|------|------|
| `index.html` / `video.html` | 页面入口 |
| `css/` `js/` | 样式与前端逻辑 |
| `images/` `covers/` `videos/` | 媒体资源 |
| `server/` | 留言板等辅助服务脚本 |
| `scripts/` / `tools/` | 构建与同步工具 |
| `wechat_articles.json` | 微信文章本地镜像数据 |

## 本地预览

```bash
python -m http.server 8080
```

浏览器访问 `http://127.0.0.1:8080/`。

## 版本与数据

- 版本说明见 `VERSION.txt`（与服务器冻结版对齐）。
- 业务数据库（SQLite 等）保存在服务器 `/opt/ross-cms/data/`，**不会**提交到本公开仓。
- 换设备接手请从服务器拉取线上目录或冻结包 `/opt/ross-releases/CURRENT`，不要依赖本仓代替生产数据。

## License

Private portfolio content. All rights reserved.
