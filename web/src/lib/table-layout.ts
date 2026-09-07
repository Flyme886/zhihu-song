/**
 * 牌桌几何。桌面刻线与卡牌落位共用这一套坐标，
 * 改了这里两边一起动 —— 别在组件里另写一份数字。
 *
 * 坐标系是「桌面摊平后」的 SVG 用户单位（透视变换之前）。
 * 容器负责把它旋成透视，几何本身不关心 3D。
 *
 * ── 为什么是 1000×540 这个「宽而浅」的比例 ──
 * 容器必须撑满一个 16:10 的画面，而 rotateX 之后近边会被透视往外拉、
 * 整体投影比 CSS 尺寸高出两成。反推回来，摊平的桌面就得是宽浅的。
 *
 * 关键约束：容器宽高比必须等于 width/height（见 ASPECT）。
 * 一旦不等，preserveAspectRatio="none" 会把两个轴按不同倍数拉伸 ——
 * 卡槽会从竖变横，圆会变成过扁的椭圆。牌桌上的卡槽是竖的，这条不能破。
 */

export const TABLE = {
  width: 1000,
  height: 540,
  /** 近边余量。刻线区域全部落在 height - nearBleed 之内，这一条被推出画外。
   *  看得见完整四条边 = 在看一件摆在远处的家具；近边在画外 = 人坐在桌前。 */
  nearBleed: 40,
  /** 桌沿内缩，刻线不贴边 */
  inset: 16,
} as const;

/** 容器宽高比。Table 组件用它设 aspect-ratio —— 别在组件里写死数字。 */
export const ASPECT = `${TABLE.width} / ${TABLE.height}`;

export type Rect = { x: number; y: number; w: number; h: number };

/**
 * 卡槽为什么是这个长宽比：
 * rotateX(24°) 会把纵向压到约 91%。要让卡在屏幕上看着是竖的（约 1:1.35），
 * 摊平时就得先「立」一点 —— 1:1.43。这就是下面 120×172 的来历。
 */
const SLOT_RATIO = 1.43;

/** 三个提问者面前的卡槽 —— 配给这个人的卡放这儿。人本身站在桌子远边之外。 */
export const ASKER_SLOTS: readonly Rect[] = [
  { x: 174, y: 22, w: 124, h: 178 },
  { x: 438, y: 22, w: 124, h: 178 },
  { x: 702, y: 22, w: 124, h: 178 },
];

/**
 * 提问者立牌的位置。y 是负的 —— 立牌铰在桌子远边（y≈8）上，往画面上方立起来，
 * 所以它整个身子在桌面之外、压在墙面那条亮带上。
 *
 * 这样安排的理由：立牌不占桌面。占了，前面 ASKER_SLOTS 就没地方放卡了。
 * 顺带还捡了个好处 —— 暗色立牌衬在亮墙上，轮廓自己就出来了。
 *
 * ── 为什么是竖的（118×150），比放卡处还窄 ──
 * 原来是横的 150×128。改竖的理由是立牌上现在有一枚圆形头像 ——
 * 横排装不下「圆 + 名字 + 三行自述」，圆会被压成一条。
 * 宽度比放卡处（124）窄 6：立牌是站在那张卡后面的人，不该比卡还宽。
 *
 * 高度 150 是量出来的上限。立牌底边铰在 y=8，顶边到 -142，
 * 也就是桌面高度的 26% 那么高一截伸到桌子上方 —— 再高就顶出画面了。
 * 它在桌子最远端，透视会把它缩小，所以屏幕上看着比这个数小。
 *
 * 比例是竖的但不是卡的比例，卡槽比例自检不管它。
 */
export const STANDEE_SLOTS: readonly Rect[] = ASKER_SLOTS.map((s) => ({
  x: s.x + s.w / 2 - 59,
  y: -142,
  w: 118,
  h: 150,
}));

/** 桌心牌堆位置。开场四张卡从这里发出去。r 是牌堆本体，ring 是外圈准线。 */
export const DECK = { cx: 500, cy: 262, r: 36, ring: 52 } as const;

/** 手牌区与桌心之间的分界线高度 */
export const HAND_DIVIDER_Y = 316;

/** 手牌区四个位置，靠近用户的一侧 —— 要读的卡离得最近，透视上最大 */
export const HAND_SLOTS: readonly Rect[] = [
  { x: 148, y: 328, w: 120, h: 172 },
  { x: 292, y: 328, w: 120, h: 172 },
  { x: 436, y: 328, w: 120, h: 172 },
  { x: 580, y: 328, w: 120, h: 172 },
];

/** 弃牌区。独立一块，不是「剩下的那张」—— 稀缺是机制核心。
 *  尺寸和手牌槽一致（弃掉的也是一张真卡），靠虚线刻线区分，不靠尺寸。 */
export const DISCARD: Rect = { x: 740, y: 328, w: 120, h: 172 };

/**
 * 结算徽章位。每个提问者的卡下面压一枚筹码，上面两个字：生效 / 无效 / 反噬。
 *
 * ── 为什么在卡下面，不在卡上面 ──
 * 盖在卡上会压掉卡脚的署名和赞数。答主的名字不能被一枚徽章挡住。
 *
 * ── 中间那枚会压住桌心的牌堆刻线 ──
 * 知道，是故意的。结算时四张卡都出去了，牌堆是空的，那圈准线不用再看；
 * 徽章有实底，盖住一段圆弧、两边露出来，看着就是「一枚筹码压在印花上」。
 *
 * 比例是横的（76×30），是筹码不是卡，卡槽比例自检不管它。
 */
export const OUTCOME_BADGES: readonly Rect[] = ASKER_SLOTS.map((s) => ({
  x: s.x + (s.w - 76) / 2,
  y: s.y + s.h + 4,
  w: 76,
  h: 30,
}));

/**
 * 结算说明面板。铺在手牌区那一排上 —— 结算时手上已经没牌了，那块地方正好空着。
 *
 * ── 为什么把最重要的字放这儿 ──
 * 这是桌面离观众最近的一条带，透视把它放大、几乎不压扁。
 * 三米外唯一能从容读完两句话的地方就是这里。
 * 反过来，提问者的卡在桌子远端，被压得最扁 —— 那儿只放两个字的徽章。
 *
 * ── 为什么不做反向补偿 ──
 * 面板这么高，rotateX(-24°) 立起来会一路挡到桌子远端的卡和徽章。
 * 它是摊在绒面上的一张纸，不是立牌。
 *
 * ── 为什么顶边在 286，越过了手牌分界线 ──
 * 量过最坏那一格：反噬时是 reveal 两行大字 + 定版句一行 + 底下弃牌那行小字。
 * 只给一个手牌槽的高度（172）装不下，会从底下切掉 —— 切掉的正好是定版句。
 *
 * 加宽解决不了：cqw 跟着自身宽度走，面板宽一倍字也大一倍，每行还是那么多字。
 * 压字号也不行：because 那一档在投影上已经贴着能读的下限。
 * 所以只能往上长。往上是牌堆那圈准线和分界线 —— 结算时牌堆是空的，
 * 那圈准线不用再看；一张纸盖过一条印在桌面上的线，看着仍然是纸压着桌子。
 *
 * 下边沿仍和手牌槽底对齐（500 = 近边余量的极限，不能再往下）。
 * 顶边不能碰到结算徽章（底 234），否则会挡住「哪个人是哪一态」。
 *
 * 右边留出弃牌区（x 740 起）—— 弃掉的那张结算时还在桌上。
 */
const PANEL_TOP = 286;
export const NARRATION_PANEL: Rect = {
  x: HAND_SLOTS[0].x,
  y: PANEL_TOP,
  w: HAND_SLOTS[3].x + HAND_SLOTS[3].w - HAND_SLOTS[0].x,
  h: HAND_SLOTS[0].y + HAND_SLOTS[0].h - PANEL_TOP,
};

/** 矩形中心，落位算 transform 用 */
export function center(r: Rect): { x: number; y: number } {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

/** SVG 用户单位 → 百分比，给绝对定位的 DOM 卡牌用 */
export function toPercent(r: Rect) {
  return {
    left: `${(r.x / TABLE.width) * 100}%`,
    top: `${(r.y / TABLE.height) * 100}%`,
    width: `${(r.w / TABLE.width) * 100}%`,
    height: `${(r.h / TABLE.height) * 100}%`,
  };
}

/** 自检：卡槽比例跑偏了就在开发时喊一声，别等到投影仪上才发现卡是横的。 */
if (process.env.NODE_ENV !== "production") {
  for (const [name, slots] of [
    ["ASKER_SLOTS", ASKER_SLOTS],
    ["HAND_SLOTS", HAND_SLOTS],
    ["DISCARD", [DISCARD]],
  ] as const) {
    for (const s of slots) {
      const r = s.h / s.w;
      if (Math.abs(r - SLOT_RATIO) > 0.06) {
        console.warn(
          `[table-layout] ${name} 比例 ${r.toFixed(2)} 偏离 ${SLOT_RATIO}，` +
            `卡在屏幕上会不够竖`,
        );
      }
    }
  }
  const maxY = Math.max(
    ...[
      ...HAND_SLOTS,
      DISCARD,
      ...ASKER_SLOTS,
      ...OUTCOME_BADGES,
      NARRATION_PANEL,
    ].map((s) => s.y + s.h),
  );
  if (maxY > TABLE.height - TABLE.nearBleed) {
    console.warn(
      `[table-layout] 刻线最低点 ${maxY} 侵入了近边余量` +
        `（应 ≤ ${TABLE.height - TABLE.nearBleed}），底部会被裁掉`,
    );
  }
  // 徽章压牌堆刻线是故意的（见 OUTCOME_BADGES），压到卡上就不是了 ——
  // 卡脚有署名和赞数，答主的名字不能被挡。
  for (const [i, b] of OUTCOME_BADGES.entries()) {
    const slot = ASKER_SLOTS[i];
    if (slot && b.y < slot.y + slot.h) {
      console.warn(
        `[table-layout] OUTCOME_BADGES[${i}] 顶边 ${b.y} 压进了放卡处` +
          `（应 ≥ ${slot.y + slot.h}），会挡住卡脚的署名`,
      );
    }
  }
  if (NARRATION_PANEL.x + NARRATION_PANEL.w > DISCARD.x) {
    console.warn(
      `[table-layout] 说明面板右边 ${NARRATION_PANEL.x + NARRATION_PANEL.w} ` +
        `盖到了弃牌区（x ${DISCARD.x}），弃掉的那张会被压住`,
    );
  }
  // 面板往上长是为了装下反噬那一格（见 NARRATION_PANEL），但不能长到徽章上 ——
  // 徽章说的是「哪个人是哪一态」，那是三格揭完后唯一还留在桌上的结论。
  const badgeBottom = Math.max(...OUTCOME_BADGES.map((b) => b.y + b.h));
  if (NARRATION_PANEL.y < badgeBottom) {
    console.warn(
      `[table-layout] 说明面板顶边 ${NARRATION_PANEL.y} 压到了结算徽章` +
        `（底 ${badgeBottom}），会挡住三态结论`,
    );
  }
}
