# Claude.design 上下文包

给 Claude.design 用的输入。四份附件 + 一份提示词，**这就是全部**。

| 文件 | 作用 | 为什么单独抽出来 |
| :--- | :--- | :--- |
| [PROMPT.md](PROMPT.md) | 首轮构建提示词，复制即用 | — |
| [BRIEF.md](BRIEF.md) | 构建任务书：三块屏、组件、动效、文案纪律 | PRD 六百多行里大半是赛事排期、API 配额、路演稿、评分权重，对画界面没用还会稀释注意力 |
| [model.ts](model.ts) | 数据契约 + 结算规则 + 等值线求解 | 类型比文字描述更不容易被误解；结算的三行规则必须让它照抄，不许自己发挥 |
| [mock-topic.json](mock-topic.json) | 占位数据 | 让界面有东西可渲染。⚠️ 全是假的，见文件内 `__PLACEHOLDER` |
| `../../prototype/index.html` | CSS 基底（**配色已废止**） | 字体、动效时长、`.card.near` 状态还能抄；`:root` 的暖棕金**别抄**，见下 |
| `../../prototype/style-compare.html` | 风格草图（**已被取代**） | 深色牌桌 + 卡面 + 结算屏的布局思路仍然有效；它的暖棕金色板**已作废**，只作历史留存 |
| [_check-mock.mjs](_check-mock.mjs) | **仓库自检脚本，不上传** | 见下 |

⚠️ `prototype/index.html` 的**交互层已废止**（v2.0 的滑杆仪器）。它现在只有两个用途：CSS 基底，以及复盘屏地图的模型与几何（`Dua` / `shiftAt` / `solveA` / `smooth`）。别让 Claude.design 参考它的 body 结构。

⚠️ **配色的单一事实来源是 `web/src/app/globals.css` 的 `@theme` 块**（冷黑白红），
说明见 [BRIEF.md](BRIEF.md) §5。两份 prototype 里的暖棕金是初版，
已经因为投影仪对比度不达标被换掉了 —— 冲突时以 `globals.css` 和 BRIEF §5 为准。

## _check-mock.mjs 怎么用

```bash
node docs/design/_check-mock.mjs
```

它**故意不 import model.ts**，把结算规则和等值线求解另写了一遍。两边算出来不一样，就说明有一边写错了 —— 这是这个脚本存在的唯一理由，所以永远别为了「省事」让它去调 model.ts。

它管三件事：mock 里手签的 `outcome` 和规则算出来的一致；每个节点都有一张三态卡、至少一次反噬；地图那句「扫过小满没扫过小雨」是真的。改了 `askers` / `cards` / `map_conditions` / `macro_conditions` 就要重跑，并照输出更新 `__verified` 和 BRIEF §3.2 / §3.3 的两张 ASCII 图。

## 不要上传

`PRD.md`（太长，且大半无关）· `TODO.md` · `NEXT_STEPS.md` · `docs/zhihu-api-reference.md` · `docs/api-probe*.md` · `docs/probe-raw/` · `docs/design/_check-mock.mjs`（仓库工具，不是给 Claude.design 的输入）。

API 那几份尤其不要 —— 运行时 0 次 API 调用，前端根本不碰接口，喂进去只会让它去考虑不存在的加载态和错误态。

## 顺序

1. 先只做一个节点的完整回路：发牌 → 指派 → 弃一张 → 结算三态
2. 再做卡面细节与三档来源徽章
3. 最后做 BRIEF §4.6 卡失效回调、§4.7 复盘地图、§4.8 结局卡

第 1 步不过关就别往下走，两个验收点：**必须弃满一张才能结算**（稀缺是机制核心，不能被绕过），**反噬那一下要有「啊?」**（这是产品唯一的高光时刻）。这两件事错了，后面做得再多都补不回来。

## 交付后

产物拿回仓库接真实数据时，`mock-topic.json` **整份替换**，别留任何占位引文 —— 硬约束是 `quote ∈ source_text`，占位引文混进 UI 会直接违反产品的核心承诺。

尤其是卡面「如果」那一句：它只能来自 `author_stated`。占位数据里那句是编的，接真数据时如果某张卡在原帖里找不到答主自述的边界，**换回答，不要降档凑数**。
