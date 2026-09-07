"use client";

/*
 * 氛围层。整层 pointer-events:none、aria-hidden —— 它不承载任何信息。
 *
 * ── 判断一个效果该不该进这个文件 ──
 * 关掉它，玩家还能不能玩完一局？能，就属于这里。
 * 所以三态的颜色、徽章、依次揭示都不在这儿；
 * 呼吸的光、浮尘、聚光、震屏、闪光在这儿。
 *
 * 这条界线是「减少动效时可以整层关掉」的前提（见 globals.css 末尾）。
 */

import { useEffect, useRef } from "react";

import { ASKER_SLOTS, TABLE, toPercent } from "@/lib/table-layout";

// ── 浮尘 ──────────────────────────────────────────────────

/**
 * 位置和时长必须是确定的。
 *
 * 静态导出 + hydration：用 Math.random 的话服务端渲染一套、客户端又一套，
 * React 会报 hydration 不匹配，而且首帧会跳。
 * 所以用一个定死种子的线性同余，每次跑出来完全一样 ——
 * 看着仍然是随机撒的，但它是同一份随机。
 */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

type Mote = {
  left: number;
  top: number;
  size: number;
  dur: number;
  delay: number;
  dx: number;
  peak: number;
};

/*
 * 34 颗。
 *
 * 数量是调出来的，不是定出来的：投影仪吃掉一半对比度，20 颗以下在会场里等于没有；
 * 50 颗以上就从「空气里有灰」变成「下雪」。34 是这两条之间。
 * 每颗都是一个合成层，34 个在 MacBook 上不掉帧。
 */
const MOTES: readonly Mote[] = (() => {
  const rnd = seeded(20160901);
  return Array.from({ length: 34 }, () => {
    // 横向压在中间 76% —— 尘只在光柱里看得见，桌子两侧是暗的
    const left = 12 + rnd() * 76;
    return {
      left,
      // 从画面下三分之二里起飞，一路往上穿过光柱
      top: 42 + rnd() * 56,
      size: 1.1 + rnd() * 2.3,
      // 时长散得很开（11~26s）：整齐的时长会让它们成群移动
      dur: 11 + rnd() * 15,
      // 负延迟 —— 首帧就是「已经在飘了」，不是「从静止开始起飞」
      delay: -rnd() * 26,
      dx: (rnd() - 0.5) * 90,
      // 靠中间的更亮：光柱中心亮
      peak: 0.22 + (1 - Math.abs(left - 50) / 50) * 0.5,
    };
  });
})();

function Motes() {
  return (
    <div className="amb-motes pointer-events-none absolute inset-0 overflow-hidden">
      {MOTES.map((m, i) => (
        <span
          key={i}
          className="absolute rounded-full"
          style={{
            left: `${m.left}%`,
            top: `${m.top}%`,
            width: m.size,
            height: m.size,
            // 冷白 —— 尘反的是头顶那排冷光，不是钨丝灯
            background: "rgb(236 244 252)",
            // 光晕比本体大一倍，尘粒才不像一个个像素点
            boxShadow: "0 0 4px 1px rgb(220 234 250 / 0.45)",
            ["--mote-dx" as string]: `${m.dx}px`,
            ["--mote-peak" as string]: m.peak.toFixed(2),
            animation: `amb-mote ${m.dur}s linear ${m.delay}s infinite`,
            willChange: "transform, opacity",
          }}
        />
      ))}
    </div>
  );
}

// ── 呼吸的光 ──────────────────────────────────────────────

/**
 * 吊灯的光锥。
 *
 * TableSurface 里已经有一层 #pool 的冷光了，为什么还要这一层：
 * 那一层在 SVG 里、跟着桌面一起倾倒，是「照在绒面上的光斑」。
 * 这一层在桌子外面、平铺在屏幕上，是「空气里的光」——
 * 两层叠起来才有体积感。而且 SVG 那层不能动（它是死的一层，见那个文件的注释），
 * 会呼吸的必须是这一层。
 */
function Breathe() {
  return (
    <div
      className="amb-breathe pointer-events-none absolute inset-0"
      style={{
        background:
          "radial-gradient(ellipse 52% 46% at 50% 21%, rgb(226 238 252 / 0.13), rgb(200 218 238 / 0.05) 42%, transparent 72%)",
        // 叠加模式：光要「加」在桌子上，不是「盖」在桌子上。
        // normal 混合会把底下的深色洗成灰，screen 只提亮不改色相。
        mixBlendMode: "screen",
        animation: "amb-breathe 11s ease-in-out infinite",
        willChange: "opacity, transform",
      }}
    />
  );
}

// ── 聚光 ──────────────────────────────────────────────────

/**
 * 打在正在揭示的那一格上。
 *
 * ── 为什么需要它 ──
 * 三格依次揭示，但桌子远端那三张卡在投影仪上离得不远、又被压扁。
 * 光靠徽章冒出来，观众的眼睛不一定跟得上「现在在说哪一个人」。
 * 一束光打过去，这件事就不用靠观察力了。
 *
 * 它在桌面平面里（Table 的 children），所以跟着桌子一起倾倒 ——
 * 光是落在绒面上的，不是浮在屏幕上的一个圆。
 */
export function Spotlight({ askerIndex }: { askerIndex: number }) {
  const slot = ASKER_SLOTS[askerIndex];
  if (!slot) return null;

  // 光锥比卡大得多，中心对准卡心。用桌面坐标算，和卡共用同一套几何。
  const w = slot.w * 4.2;
  const h = slot.h * 3.4;
  const pos = toPercent({
    x: slot.x + slot.w / 2 - w / 2,
    y: slot.y + slot.h / 2 - h / 2,
    w,
    h,
  });

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute"
      style={{
        ...pos,
        transformStyle: "preserve-3d",
        // 压在桌面之上、卡之下（卡是 translateZ(1px)）—— 光在绒面上，不在卡上。
        // 打在卡上会把卡面的字洗白，而那些字是要读的。
        transform: "translateZ(0.5px)",
        background:
          "radial-gradient(ellipse 50% 50% at 50% 50%, rgb(232 242 252 / 0.3), rgb(206 222 240 / 0.1) 46%, transparent 74%)",
        mixBlendMode: "screen",
        animation: "amb-spot-in 420ms cubic-bezier(0.22, 1, 0.36, 1) both",
        zIndex: 1,
      }}
    />
  );
}

/*
 * ── 一次性的闪光和涟漪：为什么不用 CSS animation ──
 *
 * 这两样的静止态都是「看不见」。用 `animation: … both` 的话，看不见靠的是
 * fill-mode 把末帧（opacity 0）钉住 —— 也就是说「不可见」这件事挂在
 * 一段动画确实跑完了上面。
 *
 * 那个前提不可靠：页面在后台、合成器不出帧、动画被策略禁用，
 * 任何一种情况下 fill-mode 都可能停在第一帧。而这两个元素的第一帧
 * 一个是整屏红光、一个是一圈亮环 —— 闪光那层还铺满全屏、z-index 60。
 * 投影仪上那就是一屏糊住的橙色。
 *
 * 所以反过来写：元素本身的样式就是不可见（opacity 0），
 * 亮起来是 Element.animate() 临时叠上去的一段、fill 用 none。
 * 动画没跑、跑一半、被取消 —— 结果都一样：看不见。
 * 这和 OutcomeMark 那边「该看得见的东西不能挂在动画跑完上」是同一条规矩，
 * 只是方向相反。
 */
function useOneShot(
  keyframes: Keyframe[],
  options: KeyframeAnimationOptions,
  nonce: number,
  enabled: boolean,
) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!enabled || !el?.animate) return;
    // fill 不写 = "none"：跑完不留任何东西，元素回到自己 style 里的不可见态
    const anim = el.animate(keyframes, options);
    return () => anim.cancel();
    // keyframes/options 是字面量，每次渲染都是新对象，进依赖会每帧重放。
    // 真正决定「要不要放一次」的只有 nonce 和 enabled。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce, enabled]);

  return ref;
}

/**
 * 筹码落在绒面上荡开的一圈。
 *
 * 挂载即播放一次 —— 调用方给每个位次一个固定 key，那一格揭开时挂上来，
 * 之后的重渲染不会让它再荡一次。
 */
export function Ripple({ askerIndex }: { askerIndex: number }) {
  const ref = useOneShot(
    [
      { opacity: 0.85, transform: "rotateX(-24deg) scale(0.35)" },
      { opacity: 0, transform: "rotateX(-24deg) scale(2.6)" },
    ],
    { duration: 620, easing: "ease-out" },
    0,
    true,
  );

  const slot = ASKER_SLOTS[askerIndex];
  if (!slot) return null;

  const d = 120;
  const pos = toPercent({
    x: slot.x + slot.w / 2 - d / 2,
    // 荡开的中心在筹码那儿，不在卡心 —— 是筹码磕下去的
    y: slot.y + slot.h + 4 + 15 - d / 2,
    w: d,
    h: d,
  });

  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute"
      style={{
        ...pos,
        transformStyle: "preserve-3d",
        transformOrigin: "50% 50%",
        borderRadius: "50%",
        border: "1px solid var(--red-line)",
        // 静止态：看不见。见上面 useOneShot 的注释。
        opacity: 0,
        zIndex: 11,
      }}
    />
  );
}

// ── 反噬的闪光 ────────────────────────────────────────────

/**
 * 整屏一记红光。颜色取 --color-backfire 的色相，和徽章、描边同一个色 ——
 * 闪的是「反噬」这件事，不是一个通用的警告色。
 * 整块画面是冷的，这一下红才砸得下去 —— 这也是换冷板顺手赚到的。
 */
export function BackfireFlash({
  nonce,
  enabled = true,
}: {
  /** 变一次闪一次 */
  nonce: number;
  enabled?: boolean;
}) {
  const ref = useOneShot(
    [
      { opacity: 0, offset: 0 },
      { opacity: 0.5, offset: 0.08 },
      { opacity: 0, offset: 1 },
    ],
    { duration: 700, easing: "ease-out" },
    nonce,
    enabled && nonce > 0,
  );

  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[60]"
      style={{
        background:
          "radial-gradient(ellipse 80% 60% at 50% 30%, rgb(208 32 44 / 0.85), rgb(120 18 26 / 0.4) 55%, transparent 85%)",
        mixBlendMode: "screen",
        // 静止态：看不见。这一层铺满全屏，绝不能靠 fill-mode 保证不可见。
        opacity: 0,
      }}
    />
  );
}

// ── 全屏氛围 ──────────────────────────────────────────────

/**
 * 铺在整屏上的那两层：呼吸的光 + 浮尘。
 *
 * 浮尘在最上面（z 比卡高）—— 灰尘飘在观众和桌子之间的空气里，
 * 压在卡下面就成了「桌面上的贴纸」。
 */
export function Ambience({ dim = false }: {
  /**
   * 结算时把四周压暗，视线收到桌心。
   * 只在揭示期间为真 —— 一直压着就只是个更暗的背景，不是「灯暗下来了」。
   */
  dim?: boolean;
}) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-[55]">
      <Breathe />
      <Motes />
      {/* 四周压暗。放在浮尘之上，尘也要跟着暗，否则尘会浮在暗角外面 */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 62% 58% at 50% 34%, transparent 34%, rgb(0 0 0 / 0.5) 100%)",
          opacity: dim ? 1 : 0,
          // 1.4s：灯不会瞬间暗下来。比揭示第一格的 350ms 慢得多，
          // 所以观众感觉是「光慢慢收了」，不是「画面切了一下」
          transition: "opacity 1400ms ease-out",
        }}
      />
    </div>
  );
}

/**
 * 震屏。返回一个 ref，挂到要抖的那一层上。
 *
 * ── 为什么是 hook + ref，不是组件、也不是 className ──
 * 要抖的是整个场景。组件只能包在外面，那就得多一层 div，而 Scene 最外层那个
 * div 的 relative 是 Controls 的定位基准，中间插一层会把基准挪走。
 *
 * 那为什么不返回一个 className 让调用方挂上：因为「同一个动画放第二次」
 * 用 React state 表达很别扭 —— 得先关掉、等一帧、再打开，
 * 而在 effect 里同步 setState 正是这个仓库在避免的东西（见 useReducedMotion）。
 * 直接调 Element.animate() 反而是 effect 该干的事：把状态推给一个外部系统。
 * 重复播放在这个 API 里就是「再调一次」，没有任何中间状态要管。
 */
export function useShake(nonce: number, enabled: boolean) {
  const ref = useRef<HTMLDivElement | null>(null);
  const first = useRef(true);

  useEffect(() => {
    // nonce 的初值不该触发一次抖动
    if (first.current) {
      first.current = false;
      return;
    }
    const el = ref.current;
    if (!enabled || !el?.animate) return;

    /*
     * 关键帧写在这儿而不是 CSS 里：这一段是「调用一次放一次」的动作，
     * 它的触发方式就是这行代码，没有对应的 CSS 状态。
     * 放进 globals.css 反而会让人以为存在某个类名能开关它。
     */
    const anim = el.animate(
      [
        { transform: "translate(0, 0) rotate(0deg)" },
        { transform: "translate(-5px, 2px) rotate(-0.22deg)", offset: 0.12 },
        { transform: "translate(4px, -3px) rotate(0.18deg)", offset: 0.24 },
        { transform: "translate(-3px, -1px) rotate(-0.13deg)", offset: 0.38 },
        { transform: "translate(3px, 2px) rotate(0.1deg)", offset: 0.52 },
        { transform: "translate(-2px, 1px) rotate(-0.06deg)", offset: 0.68 },
        { transform: "translate(1px, -1px) rotate(0.03deg)", offset: 0.84 },
        { transform: "translate(0, 0) rotate(0deg)" },
      ],
      { duration: 480, easing: "linear" },
    );

    /*
     * 跑完就撤掉。
     *
     * 不撤的话这一层会一直挂着一段 transform 动画 —— 哪怕停在 translate(0,0)，
     * 一个带 transform 的元素就成了它内部所有 fixed 定位元素的包含块。
     * 现在 DragGhost 在这一层外面，所以还没出事；
     * 以后谁把一个 fixed 的东西挪进场景里，它就会莫名其妙地跟着桌子跑。
     * 这种 bug 排查起来很贵，而这里撤掉只要一行。
     *
     * finished 在 cancel() 时会 reject，catch 掉 —— 那是正常路径，不是错误。
     */
    anim.finished.then(() => anim.cancel()).catch(() => {});

    // cleanup 里也要 cancel：换局或者卸载时立刻回到原位，
    // 不能留一个抖到一半的 transform 挂在整屏上。
    return () => anim.cancel();
  }, [nonce, enabled]);

  return ref;
}

/** 桌面尺寸对外露一份，给需要按桌面坐标算的氛围件用 */
export const AMB_TABLE = TABLE;
