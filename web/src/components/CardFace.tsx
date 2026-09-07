import type { Card, Evidence } from "@/lib/model";

/**
 * 回答卡的卡面。纯展示，不含 3D、不含交互 —— 那些在 HandCard 里。
 *
 * ── 为什么字号用 cqw 而不是 px ──
 * 卡是按桌面百分比定位的，桌子跟着视口缩放，卡的实际像素宽度是变的。
 * 字号写死 px，投影仪换个分辨率就会一半的卡爆行、另一半留大片空白。
 * 所以卡自己当容器，所有尺寸用 cqw —— 卡多宽，字就多大，比例恒定。
 *
 * ── 为什么要套两层 ──
 * 容器元素自己的属性里不能用 cqw。那是循环依赖（尺寸要靠 cqw 算，cqw 又要靠尺寸算），
 * 浏览器会退回去按视口算 —— 5cqw 变成视口的 5%，几十个 px，
 * padding 直接把内容框挤成 0 宽，然后子元素的 cqw 全变 0，字号 0px，整张卡空白。
 * 所以外层只负责「我是容器」，圆角、阴影、内边距这些带 cqw 的全放内层。
 *
 * ── 卡面上什么必须有 ──
 * 「如果」那一句只能是答主原文自述（见 model.ts 对 source_tier 的约束），
 * 所以来源徽章不是装饰，是这张卡能不能上桌的凭证。
 */

/** 赞数：1.2 万 这种写法，比 12300 短且是中文语境的读法 */
function formatUpvotes(n: number): string {
  if (n >= 10000) {
    const w = n / 10000;
    return `${w >= 10 ? Math.round(w) : w.toFixed(1).replace(/\.0$/, "")} 万赞`;
  }
  return `${n} 赞`;
}

export function CardFace({
  card,
  evidence,
  detail = false,
}: {
  card: Card;
  evidence?: Evidence;
  /** true = 举到眼前读的状态，多出逐字引文和出处 */
  detail?: boolean;
}) {
  const { condition } = card;

  return (
    <div
      className="h-full w-full"
      style={{ containerType: "inline-size" }}
    >
      <div
        className="flex h-full w-full flex-col overflow-hidden"
        style={{
          // 圆角收小：参考图的卡是「切割出来的」，不是圆润的塑料片
          borderRadius: "1.6cqw",
          background: "var(--color-card)",
          color: "var(--color-ink)",
          // 卡有厚度：贴着卡底的一道暗影 + 落在桌面上的一片软影
          boxShadow:
            "0 0.6cqw 0 rgb(0 0 0 / 0.4), 0 4cqw 7cqw rgb(0 0 0 / 0.55)",
        }}
      >
      {/* 卡头：年份 + 来源档。
          白底 + 一道红细线，不是深色压边 —— 卡是这一屏最亮的东西，
          头部再压一条黑带会把它切成两半，反而弱化了「一整张纸」。
          年份用红：它是这张卡在时间轴上的坐标，是唯一需要先被抓到的元数据。 */}
      <div
        className="flex shrink-0 items-center justify-between"
        style={{
          padding: "3.2cqw 4.4cqw 2.4cqw",
          borderBottom: "1px solid rgb(20 22 26 / 0.1)",
        }}
      >
        <span
          style={{
            fontSize: "8cqw",
            fontWeight: 700,
            letterSpacing: "0.06em",
            color: "var(--color-red-dim)",
          }}
        >
          {card.node_year}
        </span>
        <span
          style={{
            fontSize: "6.8cqw",
            letterSpacing: "0.04em",
            color: "rgb(20 22 26 / 0.5)",
          }}
        >
          答主原文自述
        </span>
      </div>

      <div
        className="flex min-h-0 flex-1 flex-col"
        style={{ padding: "4cqw 4.4cqw 3.4cqw" }}
      >
        {/* 建议本身。卡面上最大的字 —— 决定「给谁」时先看这一句 */}
        {/*
         * 12.4cqw 这个数是「三米外要认得出」定的。举到眼前之后这条约束没了，
         * 标题让出一点给引文 —— 卡放大 2.1 倍，10.6cqw 的绝对字号还是比桌面上大一倍多，
         * 所以是让位，不是变小。标题长的那几张（四行的）全靠这一让才装得下。
         */}
        <p
          style={{
            fontSize: detail ? "10.6cqw" : "12.4cqw",
            lineHeight: 1.32,
            fontWeight: 600,
            letterSpacing: "0.01em",
          }}
        >
          {card.headline}
        </p>

        {/* 条件线。这张卡凭什么会失效，全在这一句 */}
        {/*
         * 举起来之后这里不分栏了：金边引文紧跟在「前提」这两个字下面，
         * 本来就是一块东西。分隔线和上内边距省下来的地方给引文和署名。
         */}
        <div
          style={
            detail
              ? { marginTop: "3cqw" }
              : {
                  marginTop: "4cqw",
                  paddingTop: "3.4cqw",
                  borderTop: "1px solid rgb(20 22 26 / 0.14)",
                }
          }
        >
          <div
            style={{
              fontSize: "7.2cqw",
              letterSpacing: "0.14em",
              color: "var(--color-dim)",
            }}
          >
            前提
          </div>
          {/*
           * 举起来之后这句转述就不印了 —— 底下的逐字引文说的是同一件事，
           * 印两遍是重复，而且正好挤掉引文要的地方。
           */}
          {!detail && (
            <p
              style={{
                marginTop: "1.6cqw",
                fontSize: "9.4cqw",
                lineHeight: 1.4,
                fontFamily: "var(--font-serif)",
              }}
            >
              {condition.label}
            </p>
          )}
        </div>

        {/* 举到眼前才读的部分：逐字引文。禁止润色、禁止省略号拼接 */}
        {detail && (
          <blockquote
            style={{
              marginTop: "2.6cqw",
              paddingLeft: "3cqw",
              borderLeft: "0.8cqw solid var(--color-red)",
              fontSize: "8cqw",
              lineHeight: 1.4,
              fontFamily: "var(--font-serif)",
              color: "rgb(20 22 26 / 0.86)",
            }}
          >
            {condition.quote}
          </blockquote>
        )}

        {/* 出处。答主是知乎的核心资产，署名和赞数不能省 */}
        {evidence && (
          <div
            className="mt-auto flex shrink-0 items-baseline justify-between"
            style={{
              paddingTop: detail ? "2.6cqw" : "3.4cqw",
              marginTop: "1cqw",
              borderTop: "1px solid rgb(20 22 26 / 0.1)",
              fontSize: "7cqw",
              color: "rgb(20 22 26 / 0.52)",
            }}
          >
            <span className="truncate" style={{ maxWidth: "60%" }}>
              {evidence.author_name}
            </span>
            {/* 赞数用红。这是卡上唯一的「量」—— 它凭什么值得被采纳，
                一半的答案在这个数上。红让它在三米外还能被扫到。 */}
            <span
              style={{ color: "var(--color-red-dim)", fontWeight: 600 }}
            >
              {formatUpvotes(evidence.upvote_count)}
            </span>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
