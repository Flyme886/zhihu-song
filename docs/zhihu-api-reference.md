# 知乎开放平台 API 参考（权威档）

本项目接口相关问题以本文件为准。每条结论都标了来源；**文档说法与本项目实测冲突的地方单列在 §7，以实测为准**。

| 项 | 值 |
| :- | :- |
| 来源 A | 飞书《知乎黑客松 2026｜校园新锐季 参赛者开发流程文档》`wiki/Pd1UwIIBriW0DBk8qlIczBAVnJc`（2026-08-30 抓取，rev 693） |
| 来源 B | 飞书《开发者手册》`Mc80dR5XvoPaYDxcTasc04POnjd` |
| 来源 C | 官方 skill 包 `zhihu-cli-skill` **0.5.0** — `developer-cdn.zhihu.com/zhihu-cli/releases/stable/skill/zhihu-cli-skill.zip`，2026-08-30 下载，sha256 `5c5a7dae…` |
| 来源 D | 黑客松 skill 包 `zhihu-hackathon-skill_s2_v260815.zip`，内含官方 skill **0.2.1**（sha256 `be08e10b…`） |
| 实测 | [api-probe.md](api-probe.md)（2026-08-30，10 次真实调用） |
| 整理时间 | 2026-08-30 |

## 0. 先看这条：skill 版本有落差

黑客松包里绑死的官方 skill 是 **0.2.1**，CDN stable 现在已是 **0.5.0**。

- 0.2.1 有 **9 个端点**；0.5.0 有 **14 个**，新增额度查询 1 个 + 知识库 4 个。
- `install_official_skill.mjs` 校验包内 `assets/zhihu-cli-skill.zip` 的 sha256（`be08e10b…`），**装出来必然是 0.2.1**，不会自动升到 0.5.0。
- api-probe.md 里「无余量查询接口」是照 0.2.1 的 `cli.md:142`（原文：「v0.1 没有剩余额度查询 API」）写的，**当时没错，现在过期了**。
- 结论：CLI 装的是旧版；要用新能力就按 §2 直连 HTTP，或自己下 0.5.0 的 zip。

## 1. 三个凭证，别串位

串位是这套 API 最容易踩的坑，官方 skill 专门用一整份 `oauth-boundary.md` 讲它。

| 凭证 | 代表谁 | 用在哪 | 存哪 |
| :- | :- | :- | :- |
| **Access Secret** | 开放平台调用方（开发者账号） | 所有接口的 `Authorization: Bearer <secret>` | 钥匙串 / 线上 `ZHIHU_ACCESS_SECRET` |
| **app_id** | 第三方应用 | OAuth 授权与换 token | 可进项目公开配置 |
| **app_key** | 第三方应用密钥 | 只在后端换 token | 钥匙串 / 线上 `ZHIHU_OAUTH_APP_KEY`，**不进代码** |
| OAuth `access_token` | 已授权的知乎用户 | 用户数据接口的 `X-OAuth-Token` | 后端内存会话 |

- `app_id` 是短数字，**不能**写进 `ZHIHU_OAUTH_APP_KEY`；`app_key` **不能**写进 `ZHIHU_ACCESS_SECRET`。
- `app_key` 也**不是** `X-OAuth-Token`。
- Access Secret 领取：<https://developer.zhihu.com/profile> →「申请新 Access Secret」。单账号最多 20 个。
- 本项目的 `app_id` / `app_key` 在知乎项目提交页「查看分配的三方应用的 APP_ID 和 KEY」处取（来源 A）。属 OAuth 密钥，不要外泄、不要写进仓库。

## 2. 公共请求约定

基础域名 `https://developer.zhihu.com`（OAuth 走 `https://openapi.zhihu.com`）。

```http
Authorization: Bearer <your_access_secret>
X-Request-Timestamp: <Unix 秒级时间戳>
Content-Type: application/json
X-OAuth-Token: <oauth_access_token>   # 仅代表其他授权用户时
```

`X-Request-Timestamp` 必传且服务端会校验。业务信封统一 `{"Code":0,"Message":"success","Data":{…}}` —— **唯一例外是直答，它走 OpenAI 风格，没有 `Code` 键**（见 §3.4）。

## 3. 端点全集（0.5.0，14 个）

| # | 能力 | 方法 | 路径 | 额度 APIID |
| -: | :- | :- | :- | :- |
| 1 | 全网搜索 | GET | `/api/v1/content/global_search` | `global_search` |
| 2 | 知乎搜索 | GET | `/api/v1/content/zhihu_search` | `zhihu_search` |
| 3 | 知乎热榜 | GET | `/api/v1/content/hot_list` | `hot_list` |
| 4 | 知乎直答 | POST | `/v1/chat/completions` | `zhida_openai` |
| 5 | **额度查询** | GET | `/api/v1/quota` | 不计费 |
| 6 | 我的创作 | GET | `/api/v1/user/contents` | `user_data` |
| 7 | 我的关注 | GET | `/api/v1/user/followees` | `user_data` |
| 8 | 收藏夹列表 | GET | `/api/v1/user/favlists` | `user_data` |
| 9 | 收藏夹内容 | GET | `/api/v1/user/favlist_contents` | `user_data` |
| 10 | 近期收藏 | GET | `/api/v1/user/collections` | `user_data` |
| 11 | **知识库列表** | GET | `/api/v1/knowledge/bases` | `knowledge` |
| 12 | **知识库内容** | GET | `/api/v1/knowledge/bases/{ID}/items` | `knowledge` |
| 13 | **上传文件** | POST | `/api/v1/knowledge/files` | `knowledge` |
| 14 | **RAG 检索** | POST | `/api/v1/knowledge/search` | `knowledge` |

加粗 = 0.2.1 没有、0.5.0 新增。另有 MCP 变体：`/api/mcp/{global_search,hot_list}/v1/sse`（SSE + message，走同一 Bearer）。

**写接口：不存在。** 用户数据 API 原文「所有接口均为 `GET`」（`user-api.md:40`，0.2.1 与 0.5.0 一致）。全集里 3 个 POST 分别是直答、知识库上传、RAG 检索，**没有一个能发内容**。发想法 / 发回答 / 点赞 / 关注，API 层做不到。

### 3.1 全网搜索 `GET /api/v1/content/global_search`

本项目时间层的唯一实现路径。

| Query | 类型 | 必填 | 说明 |
| :- | :- | :- | :- |
| `Query` | String | 是 | 关键词 |
| `Count` | Int32 | 否 | 默认 10，**最大 20** |
| `Filter` | String | 否 | 高级语法，需 URL 编码（用 `--data-urlencode`） |
| `SearchDB` | String | 否 | `all`（默认）/ `realtime` / `static` |

**Filter 语法**（只有两个字段）：

- `host` — 支持 `==` `!=`，值必须双引号。
- `publish_time` — 秒级时间戳，支持 `==` `!=` `>` `>=` `<` `<=`，值不加引号。
- 逻辑符 `AND` / `OR` 必须大写，`AND` 优先级更高，可用 `()`。

```text
publish_time>=1388505600 AND publish_time<=1451577599
```

⚠️ **`host=="zhihu.com"` 及子域名不支持**。原文接着说「如需搜索仅知乎站内内容，请直接使用 `zhihu_search`」——这句极易读反。它的意思是「Filter 不能按知乎域名过滤」，**不是**「全网搜索里没有知乎内容」。实测全网搜索能返回知乎内容且能回溯到 2014，整个时间层就靠它（api-probe.md §6.1）。

Item 必返字段：`Title` `ContentType` `ContentID` `ContentText` `Url` `CommentCount` `VoteUpCount` `AuthorName` `AuthorAvatar` `AuthorBadge` `AuthorBadgeText` `EditTime`(Int64) `AuthorityLevel`；`CommentInfoList` 选返。`ContentText` 高亮用 `<em>` 包裹，`Url` 带溯源 utm 参数。

⚠️ **窗口宽度会改变你看到的内容，宽窗会藏掉前半段。** 同一 query，两年窗 2019~2020（`B3.json`）返回的知乎条目最早是 2020-02-02、**2019 年零条**；换成一年窗 2019（`B4.json`）返回 **10 条** 2019 年内容。相关性排序会让内容更多的年份挤掉相邻年份，而单次上限只有 20。**工程规则：按「年」切窗，不要按「时代」切。** 这个错误不报错、不缺字段，只会静默给出一条错的曲线。

⚠️ **知乎正文页有反爬，别想用 HTTP 补全全文。** 实测 WebFetch 与 curl（带真实浏览器 UA）取 `www.zhihu.com/question/…/answer/…` 与 `zhuanlan.zhihu.com/p/…` **全部 HTTP 403**，返回 `zh-zse-ck` 挑战页（需浏览器执行 JS）。绕过它属反爬规避，不做。深度层只能人工在浏览器里读。

### 3.2 知乎搜索 `GET /api/v1/content/zhihu_search`

| Query | 类型 | 必填 | 说明 |
| :- | :- | :- | :- |
| `Query` | String | 是 | 不能为空 |
| `Count` | Int32 | 否 | 默认 10，**最大 10**，超了服务端截断 |

**没有任何时间、排序、分页参数。** 字段比全网搜索多 `SearchHashId`、`RankingScore`、`EmptyReason`，`EditTime` 是 Int32。实测索引只到 2021，做历史回溯用不上（api-probe.md §3.4）。

### 3.3 知乎热榜 `GET /api/v1/content/hot_list`

只有一个参数 `Limit`（默认 30，最大 30，越界自动回退 30）。返回 `Total` + Items(`Title` `Url` `ThumbnailUrl` `Summary`)，仅问题和文章两类，无图无摘要时返回空字符串。

实测（`C1.json`，`Limit=3`）：**`Limit` 生效**，`Total=3` 且 Items 恰好 3 条，`ThumbnailUrl` / `Summary` 都有真实值，摘要约 200 字。字段集与文档**完全一致，无未文档化字段**——也就是说 **没有时间戳、没有赞同数**，热榜只能回答「当下什么在热」，做不了热度对比或时间层。

⚠️ 来源 A/B 都写「支持自定义时间范围（最近 N 小时）」，**0.5.0 spec 里没有这个参数**。C1 同时传了 `Hours=24`，被静默接受（Code 0），但**无法判断是否生效**——热榜本身就是当下快照，没有对照。参考 `A4.json` 的先例（未文档化参数被静默忽略），倾向于认为它没生效。别依赖它。实测额度只有 **2 次/天**（§5.1），验证成本很高，而本项目不用热榜。

### 3.4 直答 `POST /v1/chat/completions`

只保证 3 个字段：`model`、`messages`、`stream`。其他字段「不保证生效」。

| model | 说明 | 实测 |
| :- | :- | :- |
| `zhida-fast-1p5` | 快速回答 | 格式遵从好，读不到内容时诚实取逃生口 |
| `zhida-thinking-1p5` | 深度思考 | **未测** |
| `zhida-agent` | 智能思考 | 放弃 JSON 改口语文本（`C3.json`） |

`role`/`content` 多轮上下文只有 `fast` 和 `thinking` 支持，**`zhida-agent` 不支持**——这大概就是 `C3.json` 不守格式的原因。深度思考档响应带 `reasoning_content`。`stream=true` 走 SSE，心跳是 `: keep-alive` 注释行，收尾 `data: [DONE]`。

⚠️ **错误体是 OpenAI 风格，没有 `Code` 键**：`{"error":{"message","type","param","code"}}`。照 `Code==30001` 判错的代码在这里会崩。流式中途出错时 HTTP 已 200，错误塞在最后一个 chunk 的 `error` 字段里，`finish_reason:"error"`。

### 3.5 额度查询 `GET /api/v1/quota` ← 0.5.0 新增

**查询本身不消耗业务额度。** 这条把 api-probe.md 里「代码里做不了熔断」翻了过来。

`APIIDs` 逗号分隔，省略返回全部 7 项。合法值：`global_search` `zhihu_search` `hot_list` `user_data` `zhida_openai` `knowledge` `tools`。

`Data` 是数组，每项 `APIID` `APIName` `TotalQuota` `TotalUsed` `RemainingQuota`（均为自然日口径）。

```bash
curl -G 'https://developer.zhihu.com/api/v1/quota' \
  -H "Authorization: Bearer $ZHIHU_ACCESS_SECRET" \
  -H "X-Request-Timestamp: $(date +%s)"
```

返回形状（`Data` 直接是数组，**没有** `QuotaList` 这层包装）：

```json
{"Code":0,"Message":"success","Data":[
  {"APIID":"global_search","APIName":"全网搜","TotalQuota":5000,"TotalUsed":6,"RemainingQuota":4994}
]}
```

上面的数字是 2026-08-30 的快照，**只用来看形状，别当现值**——探测在持续进行，计数器一直在动。

不计费已多次验证：业务计数器只随真实业务调用增长，不因查询本身增长。

⚠️ 两个坑：`TotalUsed` **会被 `TotalQuota` 截顶**，不能当真实调用次数用；`TotalQuota` 本身也会变，同一天内观察到过一次提额（§5.1）。

### 3.6 用户数据 API（5 个，全 GET）

两种身份：不传 `X-OAuth-Token` = Access Secret 所属账号本人；传了 = 该 OAuth 用户。

- `GET /api/v1/user/contents` — `ContentType` **必填**（`all`/`answer`/`article`/`zvideo`/`pin`/`question`），`Limit` 最大 50，`SortField` 取 `ts`/`like_count`，`SortOrder` 取 `desc`/`asc`。Item 有 **`CreatedAt`（真发布时间）** `LikeCount` `CommentCount` `FavoriteCount` `Title` `Summary` `Url`。
- `GET /api/v1/user/followees` — 关注列表。
- `GET /api/v1/user/favlists` / `favlist_contents` / `collections` — 收藏夹三件套。`favlist_contents` 依赖前者的 `UrlToken`。

分页：`Offset` + `Limit`，响应 `Paging{IsEnd, NextOffset, Totals}`。⚠️ 请求 `Offset` 是 Int64 但响应 `NextOffset` 是 String，要严格解析别静默截断。

`CollectionContentItem.Author` 是个 `ContentAuthor{Name, UrlToken, Url, Gender, Headline}`——**作者主页链接只在这个族里有**，搜索族没有任何作者标识字段。

### 3.7 知识库 API（0.5.0 新增）

- `GET /api/v1/knowledge/bases?Scope=all|created|subscribed` — 不分页。
- `GET /api/v1/knowledge/bases/{ID}/items?Cursor=&Limit=` — `Limit` 1~20，游标分页，`HasMore` + `NextCursor`。
- `POST /api/v1/knowledge/files` — `multipart/form-data`，`File` 单个最大 **100 MiB**，`KnowledgeBaseID` 选填。**同步且有副作用，不要自动重试。**
- `POST /api/v1/knowledge/search` — `{Query, KnowledgeBaseIDs, RecallScopes, Limit}`，scope 取 `personal`/`subscription`/`public`，`Limit` 1~10，`KnowledgeBaseIDs` 与 `RecallScopes` 至少给一个。返回 `Content` 是有序 `array[string]`，chunk 不拼接。

专属错误码：`40004` 知识库不存在、`40005` 同文件仍在处理、`40006` 解析失败、`50002` 检索失败。

## 4. OAuth 登录

登录数是「最佳人气奖」评定条件之一（来源 A），所以这条不只是技术选项。

```text
GET  https://openapi.zhihu.com/authorize?redirect_uri={enc}&app_id={id}&response_type=code
POST https://openapi.zhihu.com/access_token     # x-www-form-urlencoded
     app_id, app_key, grant_type=authorization_code, redirect_uri, code
→ {"access_token","token_type","expires_in"}
```

踩坑清单（官方标注的**已实测偏差**，2026-05-14 知乎 2077 项目）：

1. **回调参数叫 `authorization_code`，不是 `code`**；但换 token 时表单字段仍叫 `code`。即 `code = callback.authorization_code`。接收端两个都收、以前者为主。
2. **回调不返 `state`** → 无法做标准 CSRF 校验，不能宣称生产安全。
3. `/access_token` 和 `/user` 响应里业务字段 **`code: 20000` 表示成功**，别当错误；优先判 `access_token` 是否存在。
4. `grant_type` 是固定枚举，不从回调读。
5. `redirect_uri` 必须 URL 编码且与登记值完全一致。
6. **`localhost` / `127.0.0.1` 完不成真实登录**，必须公网 HTTPS 回调（Cloudflare、Sealos 等），并登记到开放平台。本地只能预览页面。
7. 无 PKCE、无 scope、无 refresh token、无撤销/解绑接口。`/user` 没有正式响应 schema，别把猜的字段当契约。
8. 最终授权确认按钮必须用户本人点。

## 5. 额度与限流

### 5.1 额度已提到文档值（同一天内变过一次）

**当前额度 = 文档额度，可以按 5,000 做规划。** 但请记住它在一天之内变过一次，所以任何硬编码的数字都不可靠。

同一账号、同一 Access Secret，2026-08-30 当天两次实测：

| APIID | 15:28 与 15:32（`D1`/`D2.json`，两次一致） | **16:04 起（`D3`/`D4.json`）** | 文档说 | 结论 |
| :- | -: | -: | -: | :- |
| `global_search` | 10 | **5,000** | 5,000 | 已到文档值 |
| `zhihu_search` | 10 | **5,000** | 5,000 | 已到文档值 |
| `hot_list` | 2 | **100** | 100 | 已到文档值 |
| `user_data` | 1,000 | **10,000** | 10,000 | 已到文档值 |
| `zhida_openai` | 2 | **100** | 100 | 已到文档值 |
| `knowledge` | 500 | **500** | 500 | 一直一致 |
| `tools` | 2 | **10** | 10 | 已到文档值 |

**15:28 那次量到的是提额生效前的状态**，不是文档写错，也不是读数抖动——`D1`（15:28）与 `D2`（15:32）七项完全一致，互相印证。变化发生在同一个自然日内（15:32→16:04），因此不是日重置，是账号级提额生效。文档那张「邀测免费额度」表是对的。

⚠️ **工程规则不变，而且更硬了：开工先跑一次 `quota`，用返回值决定当天做多少事。** 额度能在几十分钟内涨 500 倍，也就能反向变动。别把 5,000 写进代码或计划里当常量。

**`TotalUsed` 会被 `TotalQuota` 截顶，别用它算真实调用次数。** 提额那一刻观察到的现象：直答在 ledger 里当时共 5 次（C2、C3 成功；C4、C5、C4-重试 三个 429），上限为 2 时 `TotalUsed` 显示 **2**，上限提到 100 后同样这 5 次显示 **5**。**没有发生任何新调用，数字却变了**——所以低额度下的 `TotalUsed` 是被天花板削平的，不能用来核账。

由此推翻我此前一条结论：**429 是计入额度的**。之前判断「429 不计入」，依据是 5 次调用只记 2 次——那其实是截顶假象。当时其余六项计数器在提额前后都没变、且与 ledger 精确吻合（`global_search` 5 = A3+B1+B2+B3+B4；`zhihu_search` 2 = A1+A4；`hot_list` 1 = C1），只有撞了顶的直答变了，正好符合截顶解释。

**额度查询不计费**已多次验证：多轮 `quota` 调用之间，业务计数器只随真实业务调用增长，从不因查询本身增长。

⚠️ **上表只列 `TotalQuota`，不列 `TotalUsed`，是故意的。** `TotalUsed` 是活的运行时状态——本仓库探测在持续进行，这些数字每跑一次就变（例如 `global_search` 从 5 到 6、直答从 5 到 7）。**任何写进文档的 used 值都是快照，读的时候大概率已经过期，请自己跑 `quota`。** `TotalQuota` 相对稳定，但如本节所示也会变。

### 5.2 直答的 429 是额度耗尽，不是速率限制（已结案）

原报告判断直答有「未文档化的速率限制，退避 100 s 与 3.5 min 均未恢复」，并建议「间隔 ≥72 s 起步」。**当时那批 429 的直接原因是额度耗尽**：`zhida_openai` 当日上限就是 2，C2、C3 用掉 2/2，此后 C4、C5 必然失败，退避多久都不会恢复。

✅ **已测出：短间隔连发没有速率限制。** 提额后同一 prompt 连发两次，`F1.json` / `F2.json` **双双 HTTP 200**。间隔约 **2 s**：`_ledger.tsv` 记的是完成时刻（`probe.sh` 在 curl 返回后才写账），F1 于 16:05:25 完成，F2 耗时 2.32 s 且 16:05:29 完成，故 F2 是在 F1 返回后约 2 s 发出的。所以 C4、C5 那批 429 纯粹是额度耗尽，与频率无关。~~「间隔 ≥72 s 起步」的建议~~ 彻底作废：C2→C3 那 72 s 只是当天 2 次额度的第 1 次和第 2 次，间隔从来不是变量。

范围声明：这测的是**秒级连发**。高并发（几十路同时打）未测，真要并发跑数据生产还是先小规模试一次。

结合「429 计入额度」（§5.1），直答的工程规则是：**可以连打，但每次失败都花钱。** 与其加退避，不如加「先查 `quota`、跑完核账」。

误判的根源是错误体在撒谎：它返回 `{"error":{"message":"rate limit exceeded","type":"rate_limit_error","code":"rate_limit_exceeded"}}`，字面全指向频率。**直答的 429 无法从错误体区分「频率限制」与「额度耗尽」**，只能靠 `quota` 端点判。工程规则：直答收到 429 先查 `quota`，`RemainingQuota=0` 就是当天没了；余量还在就是真的频率限制，退避重试。

### 5.3 文档额度表与额度规则

来源 C `open-platform.md`（核验 2026-08-25）：全网搜索 5,000 / 知乎搜索 5,000 / 知乎用户数据 10,000 / 热榜 100 / 直答 100 / 知识库 500 / 小工具 10。**与当前实测逐项一致**（§5.1），可以用。

规则：

- **按知乎账号隔离，不按团队。** 同账号下所有 Access Secret 共用一池，**网页效果测试也算同一池**。队内各自申请。
- 某能力耗尽后，该账号下所有 Secret 都调不了这个能力。
- 删除 Secret 不恢复额度，调用记录仍用于计算。
- 提额：来源 A 的《知乎 API 调用提额申请》表格（`PNKtwTHW6iQhnNk9c78ctfR9nye`，是 sheet，lark-cli 读不了，得网页打开）。

**额度口径冲突已结案**：来源 B 写搜索类 1,000/天，来源 A 与来源 C 写 5,000/天。**以 5,000 为准**——实测现值 5,000，来源 B 那个 1,000 是旧数或写错。

限流：`30001` 频率限制、`30002` 配额耗尽，收到就停止主动重试。**限流按端点隔离**——直答被挡时全网搜索照常（C4 得 429 期间 B2 仍 HTTP 200）。搜索类端点尚未观察到独立于额度的频率限制（连续调用间隔最短 1 s，5 次全 200）。

通用错误码：`0` 成功 / `10001` 参数错误 / `20001` 鉴权失败 / `30001` 频率限制 / `30002` 配额限制 / `90001` 内部错误。

## 6. 合规红线（来源 A 原文）

调用发布类能力时**禁止批量、高频、无意义调用**，严禁刷屏、恶意灌水、重复投稿、垃圾内容批量推送。违规后果：收回接口权限及 app_key、封禁开发者及关联账号、保留法律追责。另有「严禁批量爬取、滥用站内用户数据」（来源 B）。

本项目的「深度层人工读约 24 个公开页面」不构成批量爬取，但**不要写自动抓取知乎正文的脚本**——那条线不能碰。

## 7. 文档 vs 实测：冲突表

**以实测为准。** 完整证据在 [api-probe.md](api-probe.md)，raw response 在 `docs/probe-raw/`。

| 项 | 文档说 | 实测 |
| :- | :- | :- |
| `AuthorName` 等必返 | 必返 | `zhihu_search` 上 **10/10 为空字符串**；同字段在 `global_search` 正常。「必返」只保证键存在。**署名必须走 `global_search`** |
| `global_search` 的署名率 | 必返 | **不是全有。** 8 次检索去重 81 条知乎条目，**79 条有署名、2 条空**。空的那两条赞数是 0 和 1，且共用一张默认头像（`da8e974dc`，只有 CDN 域名 pic1/pica/picx 不同）。→ 署名为空**不是缺字段，是这条不能用**（答主是核心资产，不是素材），按丢弃处理；赞数门槛 ≥5 顺带就滤掉了 |
| `AuthorBadgeText` | 两端点全空（旧结论） | **修正：约两成有值。** 81 条里 **19 条非空**。所以认证展示不是「做不了」，是「大多数缺」。缺就界面留空，别拿别的字段凑一个看着像认证的东西 |
| `ContentID` 是不是回答 ID | 未说明 | **不是。** 它是个大负数（如 `-7920005886571028710`）。回答 ID 只能从 `Url` 正则取：`question/(\d+)/answer/(\d+)`。81/81 条都解得出 |
| 返回里的内容类型 | 未说明 | **混着专栏文章。** 81 条里 51 条回答 + 30 条 `/p/` 文章。文章没有「问题」，`question_title` 无处可填（Title 就是文章标题本身）。**且越近越多**：2026 年那 60 条原始结果里 29 条是文章，2014 年 0 条 |
| `Title` 后缀 | 未说明 | 81/81 条都以 ` - 知乎` 结尾，入库前去掉 |
| `Url` 追踪参数 | 未说明 | 都带 `?utm_medium=openapi_platform&utm_source=…`，入库前去掉 —— 卡面上要印干净的原帖链接 |
| 年份窗口准不准 | 未说明 | **准。** 请求 2014/2016/2019/2026 四个窗，返回条目的 `EditTime` 落在窗内 4/4、12/12、12/12、20/20，无一例外 |
| 匿名作者 | 展示为「知乎用户」 | 实为「知乎用户el6DZb」带随机后缀，**判断要用前缀匹配** |
| `AuthorBadge`/`BadgeText` | 认证图 / 文案 | 两端点全空，认证身份展示做不了 |
| `HasMore` | 只说 `zhihu_search` 恒 false | **`global_search` 也恒 false**，即使明显还有更多结果。不能用它判断是否继续取数 |
| `RankingScore` | 示例暗示 0~1 | 实测最大 1.947，只能当相对排序，别当概率 |
| `EditTime` | `zhihu_search` 写「发布或更新时间戳」Int32；`global_search` 写「最后编辑时间戳」Int64 | **文档自相矛盾**。实测 `publish_time` 过滤与返回的 `EditTime` 是同一个值。**未编辑的回答已人工核实 == 发布时间**：`answer/22906377` 页面「发布于 2014-02-27 09:55」且无「编辑于」标签，`EditTime`=1393466127 = 同分钟。⚠️ 仍未验证「2015 发布 2024 编辑」落哪个窗，需一条页面带「编辑于」的回答（0 配额，人工核） |
| `VoteUpCount` | 「赞同数」 | **已人工核实是实时准确值**：`answer/70654357` 页面「31 人赞同」= API 31。且**对 query 措辞不敏感**（高赞条目换措辞仍被召回），是唯一适合当图表纵轴的量 |
| 主题/话题过滤 | 未提 | **不存在**。搜的是正文文本，不是问题主题：一条讲「神器软件」的回答因正文含「提高办公会议效率」而被 `远程办公 效率` 召回。跑题只能人工筛或靠措辞规避 |
| query 措辞的影响 | 未提 | **换措辞等于换一半结果集。** 同一个 2014~2015 窗，「远程办公 效率」6 条知乎 / 3 条跑题，「在家办公 效率」5 条 / **0 条跑题**，两次 **ContentID 交集仅 4/20**（`B1` vs `E1.json`）。→ 措辞是独立于时间窗的**第二个翻页维度**，且每个年代要用当年的说法 |
| 措辞对「答主自划边界」的影响 | 未提 | **比年份更要紧，而且差一个数量级。** 观点型问法（「AI 会不会让人变笨」）30 条里 **1 条**带答主自述的条件句；做法型问法（「怎么用 AI 学习 方法 步骤 先自己想」）20 条里 **12 条**，且高赞跳到 2217 / 8135。→ 检索词一律写成**做法型**（怎么用、方法、步骤、前提、适合什么情况），别写成立场型。这条直接决定 `author_stated` 档能不能凑够卡 |
| `ContentText` 有多少是全文 | 只知截断在约 1050 字 | **多数不截断。** 81 条长度中位数 823，**64/81 在 1040 字以内**，即整篇都在手上。→ 对这 79% 的条目，`quote ∈ ContentText` 是拿**全文**在核；剩下 21% 只核过前半篇，答主可能在后半篇把话收回去，**必须人工在浏览器读完整篇**再签字 |
| `ContentText` | 「内容摘要」，未标长度 | **截断在约 1050 字**。无回答详情端点，直答两个模型都读不了 URL，**全文在纯 API 路径下拿不到** |
| 单边时间过滤 | 未提 | 缺时间戳条目 `EditTime=0`，`0<=X` 恒真会灌进垃圾（16/20）。**永远用双边窗**，双边 0/20 且产出率从 4/20 提到 6/20 |
| 分页 | 未提 | `Offset`/`SortBy`/`StartTime` 被静默接受（Code 0）但**完全忽略**，返回逐字节相同。**协议层没有分页**；用时间窗切片代替，实测相邻窗 ContentID 交集为 0 |
| `AuthorSignature` | 未文档化 | 只在 `zhihu_search` 出现，值是 `ContentID` 副本，**名不副实** |
| 余量查询 | 0.2.1：「没有剩余额度查询 API」 | **0.5.0 有 `GET /api/v1/quota` 且不计费**，已实测 200（`D1.json`）。api-probe.md 里 5 处「无余量接口」按 0.2.1 写的，现已过期 |
| **每日额度** | 搜索类 5,000（来源 A/C）或 1,000（来源 B） | **现值与来源 A/C 一致**：搜索类各 5,000、热榜 100、直答 100、user_data 10,000、knowledge 500、tools 10。但同一天内从 10/10/2/1000/2/500/2 提到了这组值，**别硬编码，开工先查 `quota`** |
| **直答 429** | 无相关说明 | **是额度耗尽，不是频率限制**（已结案）。提额后同 prompt 间隔约 2 s 连发两次双双 200（`F1`/`F2`），排除了秒级速率限制。错误体谎称 `rate_limit_exceeded`，只能查 `quota` 区分 |
| 429 是否计入额度 | 未说明 | **计入**。直答 5 次调用（2 成功 + 3 个 429）在提额后显示 `TotalUsed=5`。此前测得的「2」是被上限截顶的假象 |
| `TotalUsed` 语义 | 未说明 | **会被 `TotalQuota` 截顶**，不是真实调用次数。同样的 5 次直答调用，上限 2 时显示 2、上限 100 时显示 5 |
| 热榜 `Limit` | 默认 30，最大 30 | 生效，`Limit=3` 返回 3 条（`C1.json`） |
| 热榜时间范围参数 | 来源 A/B 说支持「最近 N 小时」 | spec 无此参数；实测传 `Hours=24` 被静默接受但**无法验证是否生效**，倾向未生效 |
| 关注流端点 | 来源 A 写 `/openapi/feed/following`、`/openapi/user/following`、`/openapi/user/followers` | **0.5.0 spec 里没有这三个**，只有 `/api/v1/user/followees`。飞书路径不可信，以 spec 为准 |
| 知乎故事 API | 来源 A 说 10 个品类，来源 B 说 5 个 | **两份 skill 里都没有故事端点**。要做盐言故事得先问 openplatform@zhihu.com |
| 发布类接口 | 来源 A 有「禁止批量调用接口发布内容」的告示 | **0.2.1 / 0.5.0 全集里都没有写接口**，`user-api.md:40` 明写全 GET。那段告示无对应端点，视为通用条款 |

## 8. 对本项目的影响

### 8.1 容量规划：恢复原判断，配额不是瓶颈

api-probe.md §4.1 判 GO 的理由之一是：「配额差两个数量级，不是瓶颈：3 议题 × 每议题 8 窗 ≈ 24 次调用即可，而全网搜索每日 5,000 次。」

**这句话现在是对的。** 实测 `global_search` 5,000/天，探测只用掉个位数。24 次调用一天之内就能跑完，不需要分日。（此处不写具体 used 值——它每跑一次就变，见 §5.1 末尾。）

（中途有一段时间额度只有 10/天，我据此写过「要跨 3 个自然日、要两个账号分摊」的排期约束——**那条已作废**，提额后不再适用。）

**并且实际预算比 24 次更宽裕，可以主动多花。** 每个年窗跑 2~3 组当年说法（措辞是第二个翻页维度，§7 冲突表），成本升到 50~70 次，仍是一个下午，换来的是候选池翻倍且跑题率显著下降。在 5,000/天面前，**为召回质量多花调用是明显划算的交易**——这是提额之后最值得改的一个决策。

仍然值得保留的两条做法，理由从「额度紧」换成「额度会变」：

- **每天开工前先 `quota` 看真实余量**（不计费）。额度在同一天内涨过 500 倍，也就能反向变动。别把 5,000 写进代码当常量。
- 脚本能**断点续跑、结果落盘复用**。这本来是为省额度，现在是为省时间和避免重复调用——依然是对的工程实践。

发现层的候选池规模不再有实际的 API 上限，原报告「不设上限，改设停止规则」的说法**完全成立**，人工工时才是真正的约束。

### 8.2 直答可用于批量了，但它读不了链接

额度 **100/天**（不是我此前测到的 2）。抽权重环节用直答跑 24 条，**一天内够用**，且秒级连发不会被限流（§5.2 已测）。

⚠️ **但直答拿不到知乎正文，所以「给它一个回答链接、让它读全文抽权重」这条路是死的。** `F1`/`F2` 是一次干净的对照实验：prompt 给了明确逃生口（读不到就把 `full_text_char_count` 填 -1、引用字段留空），两次都**逐字节相同地走了逃生口**。这不是模型偷懒，是它真的没有取 URL 的能力。

因此抽权重只有一种可行形态：**人工把正文文本贴进 prompt**，模型只做结构化，不做获取。这与 §8.4 「API 管发现 + 人工管深度」是同一条结论的两面。

`zhida-thinking-1p5` 仍未实测，额度 100/天足够试。

### 8.3 已结案的原「未测出」项

1. **额度熔断可以进代码了。** `GET /api/v1/quota` 不计费，数据生产脚本能跑前查余量、跑后核账。api-probe.md §5 与 §6.9 过期。
2. **429 计入额度**（提额后由 `TotalUsed` 截顶现象反推，并由 `D4` 直接证实：7 次尝试含 3 次 429，记 7 次。§5.1）。
3. **直答没有秒级速率限制**（`F1`/`F2` 连发双双 200，§5.2）。高并发仍未测。
4. **直答确实读不了 URL**，且是可复现的（`F1`/`F2` 两次走同一个逃生口，§8.2）。
5. **`EditTime` 对未编辑的回答就是发布时间**（人工核对页面「发布于」到分钟一致，§7 冲突表）。已编辑的情况仍未验证。
6. **`VoteUpCount` 是实时准确值**（人工核对页面赞同数一致，§7）。
7. **额度按自然日重置**（2026-09-01 新增证据）。08-30 那天 `global_search` 的 `TotalUsed` 是 5~6，09-01 开工时七项全部读到 `TotalUsed: 0`。中间没有任何提额动作，所以是日重置，不是账号变更。

**仍未结案**：`EditTime` 对**已编辑**回答显示哪个时间（需一条页面带「编辑于」的回答，人工核）；直答 JSON 结构稳定性（仅 2 个样本且分属不同模型）；高并发。**三条都不阻塞开发。**

### 8.4 维持不变

时间层 GO（`global_search` + `publish_time` 双边窗是唯一路径）；全文抽权重按原方案 NO-GO，走「API 管发现 + 人工管深度」；P2 一键转发知乎不可行（无写接口，已改为复制文案 + 跳转发布页）。

### 8.6 落地：内容管线已经跑通（2026-09-01）

- `scripts/harvest.py` + `scripts/harvest-topics/<议题>.json` —— 采集候选池。开跑前自己查 `quota`，余量不够就退出，不去撞 429。一个议题 5 年 × 3 措辞 = **15 次调用**，实测产出 33 条候选、其中 25 条带答主自述的条件句。
- `scripts/verify-content.py` —— 上线闸门。把 PRD 里「引文逐字校验，不过就丢弃」从一条规矩变成一个会失败的检查。另外拦四类静默错误：引文不是原文、卡面条件不是 `author_stated` 档、占位内容混进交付、`requires`/`strains` 填了不存在的条件 ID 或**地图层**的 `c_*`（那等于把权重塞回只有「有/没有」的结算层）。
- `scripts/_test-verify.py` —— 证明那个闸门真会失败（改一个字、换标点、省略号拼接都拦得住）。
- 候选池写到 `harvest/`，**已加进 .gitignore**：那是按检索词整段抓下来的站内正文，合规红线写着不做批量爬取与滥用站内数据。进仓库的只有人工核验过的短引文 + 原帖链接。

**PRD §12 第 2 步「抓 4~8 篇全文（~8 次）」没有实现路径**，要按 §8.4 改写：知乎正文页 403（`zh-zse-ck` 挑战），直答读不了 URL，没有回答详情端点。可用的正文只有搜索返回的 `ContentText`（79% 是全文，见 §7），剩下的靠人在浏览器里读。

**逐字校验有一个它拦不住的漏洞**，写在这里免得被当成万能：截一段话的中间，字字都是原文，意思可以正好反过来 —— 原文「我不认为前提是自制力」，引文「前提是自制力」，子串匹配必然通过。`verify-content.py` 能做的只是检查引文前一个字符是不是句末标点，不是就出提醒让人回原帖看上下文。**这一条只能靠人。**

### 8.5 新可能性（都不是必需）

- **知识库可当深度层的存储层**：人工读来的全文上传（单文件 ≤100 MiB），再用 `POST /knowledge/search` 做 RAG。额度 500/天。它**不能**帮你拿到知乎全文，只是拿到之后有地方放、能检索。
- `user_data` 实测 10,000/天。如果产品要用 OAuth 用户的收藏/关注做个性化，配额不是问题。注意 `CollectionContentItem.Author` 带 `UrlToken` 和主页 `Url`——**作者标识只在用户数据族里有**，搜索族没有。
- **`zhida-thinking-1p5` 未测**，且它和 `fast` 一样支持多轮上下文（`zhida-agent` 不支持）。抽权重环节若要更强的模型，这是候选，额度 100/天足够试（§8.2）。

## 9. 可直接跑的调用样例

凭证从环境变量取，别写进命令行历史。本仓库的 `scripts/probe.sh` 已封装记账与脱敏，探测优先用它：`bash scripts/probe.sh get <编号> <路径> ['K=V'...]`。

下面用一个 `zh` 包装函数。**`X-Request-Timestamp` 必须每次调用重新取**——服务端会校验它，而 spec 从未写明容忍窗口，所以别把 header 存进数组复用（数组会把 `$(date +%s)` 冻结在定义那一刻）：

```bash
export ZHIHU_SECRET=$(cat /tmp/zhihu-probe/.secret)
zh() { curl -sS -H "Authorization: Bearer $ZHIHU_SECRET" \
            -H "X-Request-Timestamp: $(date +%s)" "$@"; }
```

先看余量（不计费，每天开工第一件事）：

```bash
zh -G 'https://developer.zhihu.com/api/v1/quota' | python3 -m json.tool
```

全网搜索 + 单年双边时间窗（本项目发现层的标准调用）：

```bash
zh -G 'https://developer.zhihu.com/api/v1/content/global_search' \
  --data-urlencode 'Query=远程办公 效率' \
  --data-urlencode 'Count=20' \
  --data-urlencode 'Filter=publish_time>=1546272000 AND publish_time<=1577807999' \
  --data-urlencode 'SearchDB=all'
```

`Filter` 必须走 `--data-urlencode`：里面有空格、`>=` 和 `<=`，用 `-d` 会被 shell 或服务端解析错。

时间戳换算（按年切窗，注意右端点用当年最后一秒）：

```bash
python3 -c "
import datetime as d
for y in range(2014, 2027):
    a=int(d.datetime(y,1,1).timestamp()); b=int(d.datetime(y,12,31,23,59,59).timestamp())
    print(f'{y}: publish_time>={a} AND publish_time<={b}')"
```

知乎搜索（无时间参数，索引只到 2021）：

```bash
zh -G 'https://developer.zhihu.com/api/v1/content/zhihu_search' \
  --data-urlencode 'Query=Agent Memory' -d 'Count=10'
```

直答（额度 2/天，先查 quota 再发）：

```bash
zh -X POST 'https://developer.zhihu.com/v1/chat/completions' \
  -H 'Content-Type: application/json' \
  -d '{"model":"zhida-fast-1p5","messages":[{"role":"user","content":"一句话说清什么是 RAG"}],"stream":false}'
```

注意路径没有 `/api/v1` 前缀，且返回体是 OpenAI 风格、**没有 `Code` 字段**——判成功要看 HTTP 状态码和 `choices`，别去读 `Code`。

本人创作（`ContentType` 必填；代表其他用户时加 `-H "X-OAuth-Token: $TOKEN"`）：

```bash
zh -G 'https://developer.zhihu.com/api/v1/user/contents' \
  -d 'ContentType=answer' -d 'Limit=20' -d 'SortField=ts'
```

知识库检索：

```bash
zh -X POST 'https://developer.zhihu.com/api/v1/knowledge/search' \
  -H 'Content-Type: application/json' \
  -d '{"Query":"远程办公","RecallScopes":["personal"],"Limit":10}'
```

## 10. 相关入口

- 开放平台 <https://developer.zhihu.com/> ｜ 文档中心 <https://developer.zhihu.com/docs> ｜ 个人中心与 Secret <https://developer.zhihu.com/profile>
- 官方 skill（0.5.0）<https://developer-cdn.zhihu.com/zhihu-cli/releases/stable/skill/zhihu-cli-skill.zip>
- 黑客松 skill（含 0.2.1）<https://zhstatic.zhihu.com/skill/zhihu-hackathon-skill_s2_v260815.zip>
- 开放平台 openplatform@zhihu.com（1 工作日内回）｜ OAuth 申请 product-platform@zhihu.com
- 报名/组队 <https://www.zhihu.com/hackathon?activity_code=zhihu_hackathon_2026_p2>
- 交付截止 **2026-09-15 10:00**，逾期不接受任何补交
