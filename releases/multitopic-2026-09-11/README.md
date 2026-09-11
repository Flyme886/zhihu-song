# 思想引力场：多话题与讨论闭环

本目录是 2026-09-11 的独立可运行交付版。保留原生 JavaScript、Python 服务、白色知乎式左栏和深色粒子画布。

同一仓库的 `web/` 正由另一任务继续改造“我的星球”沉浸式界面；本目录固定本次方案，避免并行修改影响验收。运行时不依赖 `web/`、Node.js 包或外部 CDN。

## 启动

```sh
cd /Users/hubin/Desktop/ZhiHu/releases/multitopic-2026-09-11
python3 server.py --port 8082
```

浏览器打开 http://127.0.0.1:8082/?topic=snail 。默认首次选择蜗牛；之后恢复本机最近话题。停止服务使用 Ctrl+C。

9 个话题可直接阅读，不需要先输入。点击底部“写下我的想法”生成自己的球；可以通过按钮确认关系或拖动结伴。进入 Agent 对谈后，手动／自动推进最多 6 次发言；追问条件和彩蛋只填写草稿，提交后才生效。

结束后填写自己确认的收获和判断变化，保存到“我的讨论”。同一话题可保存多份记录；回看保持当时的材料快照，继续探索生成新会话。PNG 与 Markdown 都先预览再下载，Markdown 可编辑全文。

## 数据与模型

`cases/catalog.json` 为公开策展目录，包含 9 题、38 个观点，其中 15 条来自已核对的知乎回答，其余明确标注为策划视角。详见 [来源清单](SOURCES.md)。

无需凭证即可用本地演示。真实模型配置延续原有服务：`AGENT_API_KEY`、`AGENT_API_BASE`（以 `/v1` 结尾）及 `AGENT_MODEL`。知乎服务使用 `ZHIHU_ACCESS_SECRET` 或 `ZHIHU_SECRET_FILE`。凭证只由 Python 读取，不进入浏览器、分享卡和存储。

- GET `/api/case?topicId=snail`
- GET `/api/zhihu/status?topicId=snail`
- POST `/api/zhihu/sync`，JSON：`{"topicId":"snail"}`
- POST `/api/agent/turn`，传入 `topicId`；服务端用预定义题目与规则覆盖客户端主题字段。

以上前三个接口省略 `topicId` 时保留 `robotaxi` 行为。仅允许目录中的 ID；每题独立缓存 24 小时，手动同步最多两次搜索。没有自动热榜轮询。同步失败保留当前材料。

本机数据键为 `gravity.sessions.v1`：草稿、关系、记录、已读状态和彩蛋。相同浏览器、域名与端口共享同一份本机历史；换浏览器或端口不会自动迁移。存储不可用时显示提示并继续保留本页数据与导出能力。项目不包含账号、云同步或自动发布知乎功能。

## 验证

```sh
npm test
python3 -m unittest discover -s tests -p 'test_*.py'
```

测试不需要安装 npm 依赖。浏览器验收范围及截图见 [验收记录](ACCEPTANCE.md)。真实模型成功返回未纳入本次验收；讨论闭环使用明确标注的本地演示，异常与迟到请求用受控响应模拟。
