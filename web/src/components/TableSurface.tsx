import { OUTCOME_ORDER, spacedLabel } from "@/lib/model";
import {
  ASKER_SLOTS,
  DECK,
  DISCARD,
  HAND_DIVIDER_Y,
  HAND_SLOTS,
  TABLE,
  type Rect,
} from "@/lib/table-layout";

/**
 * 桌面本身：绒面 + 木框 + 刻线分区。全矢量 —— 投影仪上放大不糊。
 *
 * 这一层是死的（没有交互、没有状态）。卡牌、提问者立牌都叠在它上面，
 * 所以这里不要放任何可点的东西。
 */

const { width: W, height: H, inset } = TABLE;

/** 桌面上的小字。字距拉开、字号偏小，像印在桌布上而不是浮在屏幕上。 */
function SurfaceText({
  x,
  y,
  children,
  anchor = "start",
  size = 15,
  dim = false,
}: {
  x: number;
  y: number;
  children: string;
  anchor?: "start" | "middle" | "end";
  size?: number;
  dim?: boolean;
}) {
  return (
    <text
      x={x}
      y={y}
      textAnchor={anchor}
      fontSize={size}
      letterSpacing={size * 0.28}
      // 投影仪在 3 米外会吃掉一半对比度，桌面小字不能按屏幕观感调
      fill={dim ? "rgb(196 206 218 / 0.44)" : "rgb(214 224 236 / 0.72)"}
    >
      {children}
    </text>
  );
}

/**
 * 刻线卡槽。
 * 卡槽是「亮色细描边 + 内侧第二道线」，不是暗坑 ——
 * 双线才有机加工的精度感，也是投影仪上唯一还看得清的画法。
 *
 * ── accent 为什么存在 ──
 * 三个提问者面前的槽用红角标，手牌槽用钢白角标。
 * 这不是装饰上的区分，是功能上的：红的是「要往这儿放」的地方。
 * 空桌时玩家扫一眼就知道卡该往上走，不需要读桌面上那几个字。
 */
function EtchedZone({
  rect,
  dashed = false,
  corners = true,
  accent = false,
}: {
  rect: Rect;
  dashed?: boolean;
  corners?: boolean;
  /** 角标用红。只给「卡要放进去」的槽用 —— 手牌槽是卡出发的地方，不是目的地 */
  accent?: boolean;
}) {
  const { x, y, w, h } = rect;
  // 四角短刻线，长度取短边的六分之一
  const t = Math.min(w, h) / 6;
  const cornerStroke = accent ? "var(--red-line)" : "var(--glow-line)";
  return (
    <g>
      {/* 槽底比绒面略深，卡放上去才有「嵌进去」的感觉 */}
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={5}
        fill="rgb(0 0 0 / 0.22)"
      />
      {/* 外线：主描边 */}
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={5}
        fill="none"
        stroke="var(--glow)"
        strokeWidth={1.2}
        strokeDasharray={dashed ? "8 7" : undefined}
      />
      {/* 内线：第二道，压出精度感 */}
      <rect
        x={x + 4}
        y={y + 4}
        width={w - 8}
        height={h - 8}
        rx={3}
        fill="none"
        stroke="var(--glow-soft)"
        strokeWidth={0.8}
        strokeDasharray={dashed ? "8 7" : undefined}
      />
      {corners &&
        (
          [
            // [起点x, 起点y, 横线终点x, 竖线终点y]
            [x, y, x + t, y + t],
            [x + w, y, x + w - t, y + t],
            [x, y + h, x + t, y + h - t],
            [x + w, y + h, x + w - t, y + h - t],
          ] as const
        ).map(([cx, cy, tx, ty], i) => (
          <g key={`c-${i}`} stroke={cornerStroke} strokeWidth={1.6}>
            <line x1={cx} y1={cy} x2={tx} y2={cy} />
            <line x1={cx} y1={cy} x2={cx} y2={ty} />
          </g>
        ))}
    </g>
  );
}

/** 小菱形。桌面上的计数与刻度标记，实心表示「这一个是当前的」。 */
function Diamonds({
  x,
  y,
  n,
  filled = -1,
  size = 4,
  gap = 11,
}: {
  x: number;
  y: number;
  n: number;
  /** 第几个是实心的（0 起）。-1 = 全空 */
  filled?: number;
  size?: number;
  gap?: number;
}) {
  return (
    <g>
      {Array.from({ length: n }, (_, i) => {
        const cx = x + i * gap;
        const on = i === filled;
        return (
          <path
            key={i}
            d={`M ${cx} ${y - size} L ${cx + size} ${y} L ${cx} ${y + size} L ${cx - size} ${y} Z`}
            fill={on ? "var(--color-red)" : "none"}
            stroke={on ? "var(--color-red)" : "var(--glow)"}
            strokeWidth={1}
          />
        );
      })}
    </g>
  );
}

/** 桌心：牌堆位 + 多层准线。参考图这块信息量最大，是视觉重心。 */
function DeckMark() {
  const { cx, cy, r, ring } = DECK;
  const outer = ring + 30;
  return (
    <g>
      {/* 最外圈：淡 */}
      <circle
        cx={cx}
        cy={cy}
        r={outer}
        fill="none"
        stroke="var(--glow-soft)"
        strokeWidth={0.8}
      />
      {/* 中圈 */}
      <circle
        cx={cx}
        cy={cy}
        r={ring}
        fill="none"
        stroke="var(--glow)"
        strokeWidth={1}
      />
      {/* 桌心一小片浅色圆盘。这是桌面上最亮的一块非卡牌区域，
          作用是「牌堆落在这里」的落点标记 —— 空桌时它就是视觉锚点。 */}
      <circle cx={cx} cy={cy} r={r + 4} fill="rgb(214 226 240 / 0.07)" />
      {/* 牌堆本体位置：虚线，表示「这里会有东西」而不是「这里有东西」 */}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke="var(--glow-line)"
        strokeWidth={1}
        strokeDasharray="3 6"
      />
      {/* 十字准线，只在中圈与外圈之间露出四段 */}
      {(
        [
          [cx, cy - outer + 6, cx, cy - ring - 6],
          [cx, cy + ring + 6, cx, cy + outer - 6],
          [cx - outer + 6, cy, cx - ring - 6, cy],
          [cx + ring + 6, cy, cx + outer - 6, cy],
        ] as const
      ).map(([x1, y1, x2, y2], i) => (
        <line
          key={`tick-${i}`}
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke="var(--glow-line)"
          strokeWidth={1}
        />
      ))}
      {/* 左右两个内指的小三角，把视线收进桌心 */}
      {([-1, 1] as const).map((s) => (
        <path
          key={`arrow-${s}`}
          d={`M ${cx + s * (ring + 16)} ${cy - 6}
              L ${cx + s * (ring + 6)} ${cy}
              L ${cx + s * (ring + 16)} ${cy + 6}`}
          fill="none"
          stroke="var(--glow-line)"
          strokeWidth={1.2}
        />
      ))}
      {/* 中圈上的一圈细刻度。左右两处是红的 —— 那是桌心的水平轴，
          也是全桌唯一在空桌时就有红的地方，给桌面定一个中心。 */}
      {Array.from({ length: 24 }, (_, i) => {
        const a = (i / 24) * Math.PI * 2;
        const inner = ring - 5;
        const isAxis = i === 6 || i === 18;
        return (
          <line
            key={`tk-${i}`}
            x1={cx + Math.cos(a) * inner}
            y1={cy + Math.sin(a) * inner}
            x2={cx + Math.cos(a) * (ring - 1)}
            y2={cy + Math.sin(a) * (ring - 1)}
            stroke={isAxis ? "var(--color-red)" : "var(--glow-soft)"}
            strokeWidth={isAxis ? 1.8 : 0.8}
          />
        );
      })}
    </g>
  );
}

export function TableSurface() {
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="absolute inset-0 h-full w-full"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        {/* 桌心的细颗粒。「各向同性的细颗粒」，不是顺纹拉丝 ——
            x/y 频率一致且都很高，看上去才像哑光涂层而不是拉丝金属。
            做法：噪点只贡献 alpha，颜色固定成一个比桌心略深的冷灰，
            这样叠上去只是压暗出颗粒，不会像 composite 一层中灰那样把桌子洗白。 */}
        <filter
          id="feltweave"
          x="0"
          y="0"
          width="100%"
          height="100%"
          colorInterpolationFilters="sRGB"
        >
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.9 0.9"
            numOctaves={3}
            seed={11}
            result="noise"
          />
          {/* R/G/B 行全部置 0 + 末列给定值 → 输出纯色；
              A 行取 R 通道 → 纹理只体现在透明度上。 */}
          <feColorMatrix
            in="noise"
            type="matrix"
            values="0 0 0 0 0.043
                    0 0 0 0 0.051
                    0 0 0 0 0.063
                    0.4 0 0 0 -0.13"
          />
        </filter>

        {/* 外框的拉丝。这里才该是顺纹 —— 金属边框是有方向的。 */}
        <filter
          id="woodgrain"
          x="0"
          y="0"
          width="100%"
          height="100%"
          colorInterpolationFilters="sRGB"
        >
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.012 0.5"
            numOctaves={2}
            seed={7}
            result="noise"
          />
          <feColorMatrix
            in="noise"
            type="matrix"
            values="0 0 0 0 0.086
                    0 0 0 0 0.098
                    0 0 0 0 0.116
                    0.62 0 0 0 -0.18"
          />
        </filter>

        {/* 光斑和颗粒都只作用在桌心上，不能糊到外框上 —— 否则两种材质又混成一块。 */}
        <clipPath id="feltarea">
          <rect
            x={inset}
            y={inset}
            width={W - inset * 2}
            height={H - inset * 2}
            rx={7}
          />
        </clipPath>

        {/* 桌心的光。一盏灯吊在桌子上方偏后 —— 光斑中心比几何中心高。
            刻意压得很淡：桌上最亮的东西必须是白色卡面，不是桌子本身。
            桌子亮了，四张卡放上去就跟桌面抢亮度，整屏变成一片灰。
            「像桌子」靠的是取景、背后那面亮墙、外框与桌心的材质差，不是这层光。 */}
        <radialGradient id="pool" cx="50%" cy="34%" r="62%">
          <stop offset="0%" stopColor="rgb(206 220 238 / 0.15)" />
          <stop offset="26%" stopColor="rgb(190 206 226 / 0.09)" />
          <stop offset="58%" stopColor="rgb(178 194 214 / 0.032)" />
          <stop offset="100%" stopColor="rgb(178 194 214 / 0)" />
        </radialGradient>

        {/* 四边压暗，桌子有边界感，不是无限延伸的地板。 */}
        <radialGradient id="vignette" cx="50%" cy="38%" r="72%">
          <stop offset="42%" stopColor="rgb(0 0 0 / 0)" />
          <stop offset="76%" stopColor="rgb(0 0 0 / 0.28)" />
          <stop offset="100%" stopColor="rgb(0 0 0 / 0.66)" />
        </radialGradient>
      </defs>

      {/* ── 1. 外框 ── 铺满整块，桌心盖在它上面，只在四周露出一圈 */}
      <rect width={W} height={H} rx={10} fill="var(--color-table)" />
      <rect width={W} height={H} rx={10} filter="url(#woodgrain)" />
      {/* 外框顶面接光，上沿提亮一线，框才有厚度 */}
      <rect
        width={W}
        height={H}
        rx={10}
        fill="none"
        stroke="rgb(206 218 234 / 0.15)"
        strokeWidth={1.5}
      />

      {/* ── 2. 桌心 ── 比外框亮一档、内缩一圈，交界处自己形成桌沿 */}
      <g clipPath="url(#feltarea)">
        <rect
          x={inset}
          y={inset}
          width={W - inset * 2}
          height={H - inset * 2}
          fill="var(--color-felt)"
        />
        {/* 颗粒叠在底色上。滤镜只产出纹理本身，不含底色。 */}
        <rect
          x={inset}
          y={inset}
          width={W - inset * 2}
          height={H - inset * 2}
          filter="url(#feltweave)"
        />
        {/* 光斑 —— 必须在颗粒之上，否则被纹理吃掉 */}
        <rect
          x={inset}
          y={inset}
          width={W - inset * 2}
          height={H - inset * 2}
          fill="url(#pool)"
        />
      </g>

      {/* 桌心边缘的暗线：桌心是嵌进外框的，接缝处有阴影 */}
      <rect
        x={inset}
        y={inset}
        width={W - inset * 2}
        height={H - inset * 2}
        rx={7}
        fill="none"
        stroke="rgb(0 0 0 / 0.5)"
        strokeWidth={2}
      />

      {/* ── 3. 刻线分区 ── */}
      {ASKER_SLOTS.map((r, i) => (
        <EtchedZone key={`asker-${i}`} rect={r} accent />
      ))}

      <DeckMark />

      {/* 手牌区与桌心的分界线，中间断开给桌心留位置 */}
      {(
        [
          [inset + 22, DECK.cx - 150],
          [DECK.cx + 150, W - inset - 22],
        ] as const
      ).map(([x1, x2], i) => (
        <line
          key={`div-${i}`}
          x1={x1}
          y1={HAND_DIVIDER_Y}
          x2={x2}
          y2={HAND_DIVIDER_Y}
          stroke="var(--glow-soft)"
          strokeWidth={1}
        />
      ))}

      {HAND_SLOTS.map((r, i) => (
        <EtchedZone key={`hand-${i}`} rect={r} />
      ))}

      {/* 弃牌区：虚线 + 无四角刻线，和手牌区区分开。
          弃牌也是一个「要往这儿放」的目的地，所以中间压一枚红菱形 ——
          它和三个提问者槽的红角标是同一句话：卡可以来这儿。 */}
      <EtchedZone rect={DISCARD} dashed corners={false} />
      <Diamonds
        x={DISCARD.x + DISCARD.w / 2}
        y={DISCARD.y + DISCARD.h / 2}
        n={1}
        filled={0}
        size={7}
      />

      {/* ── 4. 桌面小字 ──
          参考图桌上印着字，这是「专用牌桌」和「一块深色板」的区别。
          用词只用产品自己的话：三态是 生效/无效/反噬，不是胜负。 */}
      <SurfaceText x={ASKER_SLOTS[0].x} y={ASKER_SLOTS[0].y - 10}>
        提 问 者
      </SurfaceText>
      <SurfaceText
        x={W - inset - 22}
        y={ASKER_SLOTS[2].y - 10}
        anchor="end"
        dim
      >
        节 点 01
      </SurfaceText>

      {/* 左侧：结算三态图例。第一次上手的人需要它，且它就是这局的全部规则。
          每行右边一枚小菱形，反噬那枚是实心红 —— 图例本身就先说明了哪一态是重的。 */}
      <g>
        <SurfaceText x={inset + 22} y={HAND_DIVIDER_Y - 74} size={13} dim>
          结 算 三 态
        </SurfaceText>
        {OUTCOME_ORDER.map((outcome, i) => (
          <g key={outcome}>
            <SurfaceText
              x={inset + 22}
              y={HAND_DIVIDER_Y - 52 + i * 17}
              size={12}
              dim
            >
              {spacedLabel(outcome)}
            </SurfaceText>
            <Diamonds
              x={inset + 96}
              y={HAND_DIVIDER_Y - 56 + i * 17}
              n={1}
              filled={outcome === "backfire" ? 0 : -1}
              size={3.4}
            />
          </g>
        ))}
      </g>

      {/* 左下角：轮次。参考图里这个位置是 ROUND 01 + 三枚菱形，
          它给桌面一个「这是第几手」的坐标 —— 现在只有一个节点，所以第一枚是实心。 */}
      <g>
        <SurfaceText x={inset + 22} y={H - inset - 62} size={11} dim>
          R O U N D  0 1
        </SurfaceText>
        <Diamonds x={inset + 26} y={H - inset - 44} n={3} filled={0} />
      </g>

      <SurfaceText x={HAND_SLOTS[0].x} y={HAND_SLOTS[0].y - 10}>
        手 牌
      </SurfaceText>
      <SurfaceText
        x={DISCARD.x + DISCARD.w / 2}
        y={DISCARD.y - 10}
        anchor="middle"
        dim
      >
        弃 牌 区
      </SurfaceText>

      {/* 边缘压暗，放在最上层 */}
      <rect width={W} height={H} fill="url(#vignette)" />
    </svg>
  );
}
