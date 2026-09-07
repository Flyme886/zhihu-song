# 四故事包统一后端实现说明

## 运行形态

本项目已从纯静态导出切换为 Next.js Node Server：四个故事包和试玩局由同一组 Route Handler 提供，SQLite 由 Node 内置 `node:sqlite` 驱动。运行时不调用 LLM，也不需要 Access Secret、OAuth 或用户凭证。

## Route Handler

| 请求 | 用途 | 公开性 |
|---|---|---|
| `GET /api/story-packs` | 获取四个故事包的公开目录 | 公开，不含隐藏条件 |
| `GET /api/story-packs/{packId}` | 获取任一故事包的开场、短引文、卡和署名 | 公开，不含隐藏条件 |
| `POST /api/story-packs/{packId}/runs` | 创建任一故事包的试玩局 | 返回 `runId` |
| `POST /api/runs/{runId}/settle` | 提交三张投递卡 | 服务端判定并返回复盘 |
| `GET /api/runs/{runId}/review` | 读取已结算复盘 | 未结算返回 409 |

## 数据和安全

- `.data/zhihu-stories/`：官方正文的本地同步快照，不进入 Git，不下发给浏览器。
- `.data/story-runs.sqlite`：试玩局、投递与不可变结算结果，不进入 Git。
- 前端只获得公开故事包；阅读线的条件集合和判定逻辑仅由服务端模块读取。
- 每局强制“三条阅读线、三张不同卡、一张压下”。重复提交同一局返回第一次结算，避免结果漂移。

## 内容边界

`sync:story-packs` 先从官方列表确认四个 `work_id`，再读取详情；拒绝非数字 ID。`sync:blue-blood` 仍保留为兼容别名。短引文均保留作品与作者署名。游戏解读是项目原创的阅读机制，不应被展示为知乎回答、原作正文或作者续写。
