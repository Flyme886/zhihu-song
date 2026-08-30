# 知乎 API 探测方案（第一步产出，待评审）

零成本调研已完成，**尚未消耗任何配额**。本文是待批准的探测方案。

资料来源（全部离线可查）：

- 官方 skill 包 `zhihu-hackathon-skill_s2_v260815.zip`（HTTP 200，83802 字节，已解包到 `/tmp/zhihu-probe/skill/`）
- 包内嵌套的官方 `zhihu` skill v0.2.1（`assets/zhihu-cli-skill.zip`，SHA-256 `be08e10b…c2f9f3`）
- 赛事飞书文档（上一 session 已抓取，缓存在 `~/.claude/projects/.../tool-results/bqai0rky1.txt`）

---

## 0. 三个结论：不花配额就已经定了

这三条来自官方文档正文，不是推测。它们直接改产品方案，建议先看这一节再看矩阵。

### 0.1 搜索结果里没有 `created_at`，只有 `EditTime`

`zhihu_search` 返回的时间字段只有一个：

| 字段 | 官方原文说明 | 出处 |
|---|---|---|
| `EditTime` | Int32，「发布时间或更新时间戳」 | `references/http-api.md:357` |

同一个字段在全网搜索文档里写得更明确：「**最后编辑时间戳**」（`http-api.md:150`）。

`CreatedAt` 这个字段在整个平台**确实存在，但只存在于本人数据接口**（`/api/v1/user/contents`、`/api/v1/user/collections`），搜索结果里没有。

这正是你警告过的那个坑。我不会写「可从 ID 推算」——**答案是：搜索结果没有 created_at 字段**。一条 2015 年发布、2024 年编辑过的回答，`EditTime` 会是 2024。这对「历史回答作固定点」是直接伤害，A2 探测就是去量这个伤害有多大。

### 0.2 `zhihu_search` 没有分页，硬顶 10 条

| 事实 | 官方原文 |
|---|---|
| `Count` 最大 10，超了服务端截断 | `http-api.md:323,329` |
| `HasMore` **固定返回 `false`** | `http-api.md:337`「当前实现固定返回 `false`」 |
| 无 `Offset` / `Page` / `Sort` / 时间范围参数 | 请求参数表只有 `Query` 和 `Count` |

所以：**一个 query 一辈子只能拿到 10 条**，且不能翻页、不能按时间排序、不能限定时间窗。

「靠翻页深度硬捞低赞长尾」这条路在协议层面就不存在。低赞长尾只能靠**换 query 措辞**去撞，不能靠翻页。

配额宽松（1000/天）在这里几乎没有意义 —— 瓶颈不是调用次数，是**每次调用的信息量上限**。

顺带一个可能有用的不对称：`global_search` 的 `HasMore` 是真实布尔（「是否有下一页数据」，`http-api.md:132`），`Count` 上限 20，但**同样没有 offset 参数**。所以它的「下一页」也拿不到 —— 除非用 `Filter=publish_time` 切时间窗，把大结果集切成若干小窗逐个取。**时间窗切片是这套 API 里唯一的「翻页」替代品，而它只在全网搜索上可用。** 这让 A3（全网搜索能否返回知乎内容）的价值远高于它的排位。

### 0.3 没有任何写接口，P2「一键转发到知乎想法」做不了

全包 grep 出的端点全集，一共 9 个真实端点 + 4 个 MCP 包装：

| 端点 | 方法 | 性质 |
|---|---|---|
| `/api/v1/content/zhihu_search` | GET | 只读 |
| `/api/v1/content/global_search` | GET | 只读 |
| `/api/v1/content/hot_list` | GET | 只读 |
| `/v1/chat/completions` | POST | 生成，不写站内 |
| `/api/v1/user/contents` | GET | 只读 |
| `/api/v1/user/followees` | GET | 只读 |
| `/api/v1/user/favlists` | GET | 只读 |
| `/api/v1/user/favlist_contents` | GET | 只读 |
| `/api/v1/user/collections` | GET | 只读 |

用户数据 API 文档明确「所有接口均为 `GET`」（`user-api.md:40`）。OAuth 也没有 scope 概念（`oauth.md:143`「文档没有 PKCE、scope…」），没有任何发布类权限位。

**P2 建议直接砍掉，换成「复制文案 + 跳转知乎发布页」**，用户自己粘贴。零 API 依赖，体验损失很小。这条不需要花配额验证 —— 接口不存在，测不出来。

另外三个承重能力的文档层预判：赞数 `VoteUpCount` **有**（`http-api.md:352`）；全文 `ContentText` 官方定性为「内容摘要」**不是全文**（`http-api.md:349`，SKILL.md:78 再次强调「搜索摘要不是完整原文」）；2014 年纵深未知，是 A2 的任务。

---

## 1. 前提：skill 会不会吞掉原始返回体

**不会。** CLI 文档明确承诺（`references/cli.md:265-272`）：

> 成功时，CLI 将服务端原始响应写入 stdout：不裁剪字段。不修改字段名、大小写或嵌套结构。不丢弃 API 后续新增的未知字段。

所以字段探测有意义。但方案里我**不走 CLI，直接用 curl 打 HTTP API**，理由三条：

1. CLI 安装要下二进制、校验 SHA-256，且 `auth set` / `auth status --verify` / `me contents` 三步验收本身要**多花 2~3 次真实调用**（SKILL.md:49 明说「两次调用都可能消耗接口额度」）。curl 零开销。
2. curl 拿到的是真正的原始字节，连 CLI 的透传承诺都不需要信。
3. 探测完写代码时，后端是 FastAPI，本来就要直接发 HTTP，不会带上一个 macOS-only 的 CLI。

⚠️ **有一个 MCP 陷阱记一下**：MCP 版 `zhihu_search` 返回的 XML 里**没有 `VoteUpCount`、`CommentCount`、`ContentID`**（对比 `mcp.md:407` 的 `search_item` 属性表与 `http-api.md:344` 的字段表）。如果哪天为了省事挂 MCP server，赞数就丢了。**只用 HTTP API，别用 MCP。**

## 2. 认证与凭证

- 方式：`Authorization: Bearer <access_secret>` + `X-Request-Timestamp`（秒级 Unix）
- 没有 scope / 权限位概念，**一个 Access Secret 等于全部 API 权限**（`open-platform.md:45`）
- 申请入口：<https://developer.zhihu.com/profile> →「申请新 Access Secret」

**这是当前唯一的阻塞项：本机没有 Access Secret。** 已确认 keychain 无条目、无 `ZHIHU_ACCESS_SECRET` 环境变量、CLI 未安装。

需要你去 profile 页申请一个然后给我。我会用 `export` 注入到探测脚本的进程环境，**不写进任何文件、不进 git、不回显完整值**。

## 3. 配额：文档自相矛盾，需要你用眼睛确认

| 来源 | 知乎搜索 | 全网搜索 | 热榜 | 直答 |
|---|---:|---:|---:|---:|
| 赛事飞书文档 | 1,000/天 | 1,000/天 | 100/天 | 100/天 |
| `open-platform.md`（核验 2026-07-16） | **5,000/天** | **5,000/天** | 100/天 | 100/天 |

你给我的数字（搜索 1000）和赛事文档一致，和平台文档不一致。可能是赛事账号被单独下调，也可能平台文档更新了。**这个不能用 API 测出来** —— `cli.md:142` 明说「v0.1 没有剩余额度查询 API，也不从网页抓取额度」。

已经从文档定死的额度规则（`open-platform.md:42-47`）：

- 单账号最多申请 20 个 Access Secret
- **同一账号下所有 Access Secret 共享同一额度池**
- **网页效果测试与 API 调用共享同一池**（在 profile 页点「试一试」也扣额度，别手滑）
- 某能力额度耗尽后，该账号下所有 Secret 都不能再调该能力

→ **你问的「团队共享还是每人独立」，文档层面已经有答案：按知乎账号隔离。** 你和队友各用自己的知乎账号申请，就是两个独立池；共用一个账号的两个 Secret，就是同一个池。

建议：**两人各自申请，账号不要共用。** 这样开发调试和路演现场天然不互相挤占。你原本设计的「我连调 N 次、队友立刻查余量」这个协作测试，只在你们打算共用账号时才有必要 —— 而共用账号本来就该避免。所以我把它降级成 P2（矩阵 D2），只在你确认要共用账号时才做。

日界（北京时间 / UTC、固定 / 滚动）文档没写，也没有 API 能查。只能靠 profile 页用量统计观察，或者发信问 <openplatform@zhihu.com>（工作日 1 日内回，比试出来快）。

## 4. 探测矩阵

预算 **13 次**（阻塞问题 11 次 + 可选 2 次），在 15 次以内。按「最便宜的否证优先」排。

### 阶段 A — 一次调用否证整个时间层（3 次）

| # | 要回答的问题 | 端点 | 参数 | 次数 | 从哪个字段读答案 |
|---|---|---|---|---:|---|
| **A1** | ★ 2015 年前后的老回答能不能被检索到？`EditTime` 最早到哪年？ | `zhihu_search` | `Query=拍照搜题 软件 会不会让学生变懒`, `Count=10` | 1 | `Items[].EditTime` 全部转北京时间取最小值；同时读全字段清单、`ContentText` 长度、`VoteUpCount` 分布、`Url` 形态、`AuthorityLevel`、`RankingScore`、有无匿名（`AuthorName=="知乎用户"`） |
| **A2** | ★ `EditTime` 到底是发布时间还是最后编辑时间？ | — | 用 A1 返回的 `Url` 人工打开 2~3 条，比对页面上的「发布于 / 编辑于」 | 0 | 页面文案 vs `EditTime`。**这条不花配额，是纯人工核对，但它决定 created_at 的最终结论** |
| **A3** | ★ 全网搜索能不能返回知乎站内结果？（若能，`publish_time` filter 就是通往老回答的唯一时间闸门） | `global_search` | `Query=远程办公 效率`, `Count=20`, `Filter=publish_time<=1483200000`（2017-01-01 之前） | 1 | `Items[].Url` 里有没有 `zhihu.com`；有几条；`EditTime` 是否真的都 ≤ 2017 |
| **A4** | 未文档化的参数会被静默接受还是报错？`Offset` 真的不存在吗？ | `zhihu_search` | `Query=` 同 A1，`Count=10`, `Offset=10`, `SortBy=time`, `StartTime=1420070400` | 1 | `Code` 是否 0；`Items` 与 A1 逐条比对 `ContentID`。**全同 = 参数被忽略；不同 = 有隐藏分页，是重大好消息** |

A1 是全局最便宜的否证点：一次调用同时回答「字段清单 / 时间字段 / 赞数 / 链接 / 全文与否 / 单页条数 / 匿名可见性 / 权威度」八个问题。
若 A1 的 `EditTime` 最早只到 2023，且 A3 也捞不到知乎老内容 → **时间层当场判死**，后面 9 次不用花。

### 阶段 B — 历史纵深与长尾的可重复性（4 次）

只在 A 阶段没判死时执行。

| # | 要回答的问题 | 端点 | 参数 | 次数 | 从哪个字段读答案 |
|---|---|---|---|---:|---|
| **B1** | 纵深是否跨议题稳定（远程办公） | `zhihu_search` | `Query=在家办公 效率 比公司高吗`, `Count=10` | 1 | `EditTime` 最小值、分布 |
| **B2** | 纵深是否跨议题稳定（电动车 2014~2015） | `zhihu_search` | `Query=电动汽车 续航 里程焦虑 值得买吗`, `Count=10` | 1 | 同上 |
| **B3** | ★ 低赞长尾（<50 赞）可见吗 | `zhihu_search` | `Query=` 一个刻意冷门的长尾问法, `Count=10` | 1 | `VoteUpCount` 最小值。测不到 <50 就写「测不到 + 无排序参数、无分页，协议上无法定向」 |
| **B4** | 同一 query 重复调用，结果是否稳定（缓存策略前提） | `zhihu_search` | 与 A1 完全相同 | 1 | `ContentID` 序列与 A1 是否一致；`SearchHashId` 是否变 |

### 阶段 C — 直答 Agent 与热榜（4 次）

| # | 要回答的问题 | 端点 | 参数 | 次数 | 从哪个字段读答案 |
|---|---|---|---|---:|---|
| **C1** | 热榜真实返回结构；飞书文档说的「支持最近 N 小时」参数是否真的存在 | `hot_list` | `Limit=3`, 外加 `Hours=24` 试探 | 1 | `Data.Items[]` 字段；`Hours` 是否报错或被忽略。**注意：热榜只有 100/天，且只返回 Title/Url/Thumbnail/Summary，对本产品基本无用，只为交付物完整性测 1 次** |
| **C2~C4** | ★ 直答 JSON 输出稳不稳定；输入长度上限；单次耗时 | `/v1/chat/completions` | 同一 prompt 连发 3 次，`model=zhida-fast-1p5`，prompt 内含 ~6000 字回答正文 + 严格 JSON schema 要求 | 3 | `choices[0].message.content` 能否 `JSON.parse`；3 次的 key 集合是否漂移；`time` 实测耗时；是否报 400/长度错 |

⚠️ 直答 API **只支持 `model`/`messages`/`stream` 三个字段**（`http-api.md:631`），**没有 `response_format`、没有 `temperature`**。所以 JSON 稳定性只能靠 prompt 约束，无法用参数强制。这直接影响「条件提取 + 权重排序」环节的工程设计 —— 必须写容错解析 + 重试。C2~C4 就是量这个风险。

### 阶段 D — 可选（2 次，按需）

| # | 要回答的问题 | 端点 | 次数 | 说明 |
|---|---|---|---:|---|
| **D1** | 队友是否在 3 议题下写过回答（地基假设 3）；顺便验证 `CreatedAt` 在本人接口真实存在 | `/api/v1/user/contents` | 1 | 需队友配置自己的 Access Secret 后由他跑。`ContentType=answer&Limit=50&SortField=ts&SortOrder=asc` 可直接看他最早的回答和真实 `CreatedAt` |
| **D2** | 配额是否跨 Secret 共享 | 任意 | 0~2 | **仅在你们决定共用一个知乎账号时才做**。否则文档已给出答案，不值得花配额 |

### 不测的项目与原因

| 项目 | 为什么不测 |
|---|---|
| 写接口 / 发想法 / 发评论 | 端点不存在，无从调用（§0.3） |
| 问题详情 / 回答详情 / 评论列表 / 专栏 | 端点不存在。评论只能拿到搜索结果里嵌的 `CommentInfoList`（只有 `Content` 一个字段，无作者无时间） |
| 分页最深能翻到第几页 | `HasMore` 固定 false 且无 offset 参数，A4 试探过就结束 |
| 并发上限 | 不值得花配额撞 `30001`。产品是离线生产 + 运行时 0 调用，串行足够 |
| 已折叠 / 已删除回答 | 无法构造判定条件（拿不到 fold 状态字段）。匿名回答可由 A1 的 `AuthorName` 顺带观察 |
| 剩余额度查询 | 无此 API（`cli.md:142`） |

## 5. 纪律落地

- 每次调用的完整请求（脱敏 Authorization）与原始返回体存盘到 `docs/probe-raw/<编号>-<端点>.json`，一次一个文件，原样不加工
- 探测脚本 `scripts/probe.sh`，凭证只从环境变量读，不落盘
- 边测边记账，最后出台账表
- 字段不存在就写不存在

## 6. 需要你拍的四件事

1. **Access Secret**：去 <https://developer.zhihu.com/profile> 申请一个发我（这是唯一阻塞项）
2. **账号策略**：你和队友各自申请、不共用账号？（我的建议：是。这样 D2 可以整个跳过）
3. **A 阶段的 3 个 query 措辞**：你比我懂这三个议题 2014~2016 年的真实说法。我列的措辞如果不像当年的问法，纵深会被 query 质量拖累，而不是被 API 能力拖累 —— 这是最容易误判的地方，想请你改一版
4. **P2 转发想法**：确认改成「复制文案 + 跳转发布页」？（接口层面没有别的选择）
