import { OUTCOME_LABEL, type Outcome } from "@/lib/model";
import { rectFor } from "@/lib/placement";
import { OUTCOME_BADGES, toPercent } from "@/lib/table-layout";

/**
 * 结算时压在提问者卡上的判定：卡边一道收紧的描边 + 卡下面一枚筹码。
 *
 * ── 为什么要两样，不能只留一样 ──
 * 只有颜色不行 —— 三米外投影仪吃掉一半对比度，而且红绿色盲分不出正红和冷灰。
 * 只有两个字也不行 —— 桌子远端的卡被透视压得最扁，字小，扫一眼抓不住。
 * 所以颜色管「远远看一眼就知道有事发生」，两个字管「到底是哪一态」。
 *
 * ── 为什么徽章不叫图例的名字以外的词 ──
 * 桌面上印着「结 算 三 态」那三个词（见 TableSurface），筹码上必须是同样的字 ——
 * 图例和结果对不上，图例就白印了。所以四个用到它的地方（这里、绒面图例、
 * 结算面板表头、读屏那句播报）都从 model.ts 的 OUTCOME_LABEL 取，没有第二份。
 *
 * ── 3D ──
 * 描边贴着卡浮一层（卡在 translateZ(1px)，这里 2px），跟着桌面一起倾倒。
 * 筹码要正对观众，所以 rotateX(-24deg) 抵消桌面倾角、transformOrigin 压到底边,
 * 像一枚立在桌心上的牌品。
 *
 * ── 为什么不淡入 ──
 * 一枚筹码落在绒面上是「啪」一下，本来就没有淡入这回事。
 * 还有个更硬的理由：淡入得靠 animation，而 animation 一旦时间轴不前进
 * （页面在后台、合成器不出帧），fill-mode 会把元素钉在第一帧 —— 也就是 opacity 0。
 * 「看得见」这件事不该挂在一段动画跑完上。停下来的时候该看得见，不该消失。
 * 节奏由「哪一秒挂上来」给（见 useReveal），不由淡入给。
 */

type Look = {
  /** 两个字的颜色，也是描边和外发光的色相 */
  ink: string;
  /** 筹码底色。要压得住底下的牌堆刻线，所以是实底不是半透明 */
  chip: string;
};

/*
 * 三态的色相来自 globals.css 的 --color-effective / -ineffective / -backfire，
 * 不在这儿另配一套。这里只按投影仪的需要调实底和描边的浓度：
 * 草图里那些 0.1 的淡底是给「深色页面上的一块面板」用的，
 * 铺到桌心上、再经过投影仪，就什么都看不见了。
 *
 * 三个实底都是冷灰，只在反噬那枚里掺一点红 ——
 * 筹码是「结果」，结果该由字和描边说话；底色跟着桌子，不跟着情绪。
 */
const LOOK: Record<Outcome, Look> = {
  effective: { ink: "var(--color-effective)", chip: "#13161a" },
  ineffective: { ink: "var(--color-ineffective)", chip: "#141619" },
  backfire: { ink: "var(--color-backfire)", chip: "#1a1114" },
};

export function OutcomeMark({
  outcome,
  askerIndex,
  askerName,
  tightened = false,
}: {
  outcome: Outcome;
  askerIndex: number;
  askerName: string;
  /**
   * 反噬那一下的顿挫。描边由软变硬、由粗收细 —— 一瞬间完成，不做过渡。
   * 只有反噬格会传 true。
   */
  tightened?: boolean;
}) {
  const badge = OUTCOME_BADGES[askerIndex];
  if (!badge) return null;

  const look = LOOK[outcome];
  // 卡的位置从 placement 那边拿，不在这儿另算一份 —— 差一个像素在投影仪上就是一条鬼影
  const card = rectFor({ kind: "asker", i: askerIndex });

  return (
    <>
      {/* 卡边描边。卡自己不知道结算的事，所以这是浮在卡上的一层，不改 HandCard。 */}
      <div
        aria-hidden
        className="pointer-events-none absolute"
        style={{
          ...toPercent(card),
          transformStyle: "preserve-3d",
          transform: "translateZ(2px)",
          borderRadius: "6px",
          // 顿挫之前是一圈软光，之后收成一道硬边 —— 「收紧」是这么来的
          boxShadow: tightened
            ? `inset 0 0 0 2px ${look.ink}, 0 0 0 1px ${look.ink}`
            : `inset 0 0 0 1px color-mix(in srgb, ${look.ink} 55%, transparent), 0 0 16px color-mix(in srgb, ${look.ink} 30%, transparent)`,
          zIndex: 11,
        }}
      />

      {/* 筹码 */}
      <div
        className="absolute"
        style={{
          ...toPercent(badge),
          containerType: "inline-size",
          transformStyle: "preserve-3d",
          transformOrigin: "50% 100%",
          transform: "rotateX(-24deg)",
          zIndex: 12,
        }}
      >
        <div
          className="flex h-full w-full items-center justify-center"
          style={{
            borderRadius: "4cqw",
            background: look.chip,
            border: `1px solid color-mix(in srgb, ${look.ink} ${tightened ? "80%" : "50%"}, transparent)`,
            boxShadow: tightened
              ? `0 2cqw 5cqw rgb(0 0 0 / 0.55), 0 0 0 1px ${look.ink}`
              : "0 2cqw 5cqw rgb(0 0 0 / 0.55)",
          }}
        >
          <span
            style={{
              // 三枚筹码的字压在自己的实底上：生效 13.8:1、无效 3.95:1、反噬 3.46:1。
              // 换冷板之后生效那枚从 4.4 涨到 13.8（冷白比赭色亮得多），
              // 另两枚还是过不了 AA 的 4.5。不动调色板的色，改成够大的字号 ——
              // 18.8px + 700 算「大字」，门槛降到 3:1，三枚都过。
              // 两个字加字距约 43px，筹码有 90px 宽、35px 高，装得下。
              fontSize: "21cqw",
              fontWeight: 700,
              letterSpacing: "0.14em",
              // letterSpacing 会在最后一个字右边也加一份，字看着偏左，补回来
              textIndent: "0.14em",
              color: look.ink,
            }}
          >
            {OUTCOME_LABEL[outcome]}
          </span>
        </div>
        {/* 桌面上是两个字，读屏得念成一句话 */}
        <span className="sr-only">{`${askerName}：${OUTCOME_LABEL[outcome]}`}</span>
      </div>
    </>
  );
}
