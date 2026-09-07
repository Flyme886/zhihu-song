import { useId } from "react";

/*
 * 三张提问者头像。手绘 SVG，不是照片，也不是生成的人脸。
 *
 * ── 为什么不用真人照片 ──
 * BRIEF §2.4：提问者是虚构的，立牌底下就印着「虚构人物」。
 * 贴一张真人的脸会让这句话变成假话 —— 那个人没同意替一个虚构角色代言。
 * 而且这三个是初三到高二的学生，是未成年人，更不该拿真实长相去凑。
 * 所以画出来：明摆着是插画，谁都不会以为是在给某个具体的人出建议。
 *
 * ── 为什么值得画三张，而不是三个字母 ──
 * 配卡这件事就是「看着这个人，猜他缺什么」。一张脸会让人多看两秒，
 * 一个字母只会被当成编号。三张脸各自要能在 60px 上一眼分开，
 * 所以分靠的是剪影和一个特征（发型、眼镜），不是五官细节 ——
 * 投影仪三米外，细节全糊，剪影还在。
 *
 * ── 怎么搭出来的 ──
 * 半身像，从下往上叠：肩 → 脖子 → 领 → 耳 → 脸 → 头发 → 五官。
 * 头发画在脸上面，一条闭合路径：共用的外缘弧 + 各自的发际线（见 HAIR_OUTER）。
 * 第一版是反过来的 —— 头发在脸后面画一个大一圈的形，再用脸压上去。
 * 那样下缘一定是条水平直线，小尺寸上就成了两块方耳朵。
 *
 * ── 配色 ──
 * 四档，全冷：近黑（头发、五官）、冷白（脸）、冷灰（脖子耳朵）、石板灰（衣服）。
 * 衣服不用近黑 —— 第一版是黑的，在小尺寸上糊成一块方疙瘩，看不出是肩膀。
 * 底下那枚红圆是立牌「成套」的那一下，脸上一点红都没有：
 * 红要是也上了脸，它就不再是「有事发生」的信号了。
 */

const INK = "#14161a"; // 头发、五官。和卡面墨色同一个值
const FACE = "#eaf0f7"; // 脸。冷白，压在红圆上对比够
const SHADE = "#bcc6d3"; // 脖子、耳朵。比脸暗一档，靠它出立体
const CLOTH = "#39414d"; // 衣服。冷石板灰
const COLLAR = "#586373"; // 领口，比衣服亮一档才看得出是个领子

/** 画哪张脸。按 asker.id 认人 —— 不按下标，免得换了数据顺序脸就跟着串位。 */
type Variant = "man" | "yu" | "zhe";

const VARIANT_BY_ID: Record<string, Variant> = {
  k_xiaoman: "man", // 高二住校：短发齐整，眉平，神色自足
  k_xiaoyu: "yu", // 初三走读：厚刘海压着眉，眼睛大，嘴张一点
  k_azhe: "zhe", // 高一转学：眼镜 + 侧分，眉压着，嘴角往下
};

/** 认得出的 id 才画脸；认不出来就回到姓名末字（见 AskerStandee 的调用处）。 */
export function variantFor(id: string): Variant | null {
  return VARIANT_BY_ID[id] ?? null;
}

export function AskerPortrait({ variant }: { variant: Variant }) {
  // clipPath 的 id 在整份文档里要唯一 —— 三块立牌同时在页面上，
  // 写死一个字符串的话后两个会去引用第一个的裁剪区
  const cid = useId();

  return (
    <svg
      viewBox="0 0 40 40"
      width="100%"
      height="100%"
      aria-hidden
      style={{ display: "block" }}
    >
      <defs>
        <clipPath id={cid}>
          <circle cx="20" cy="20" r="20" />
        </clipPath>
      </defs>
      {/* 裁进圆里 —— 肩膀是画到框外再切掉的，切口才是直的 */}
      <g clipPath={`url(#${cid})`}>
        {/* 肩。画得比圆宽，两头切掉，所以是「肩膀延伸到画外」不是一块石头 */}
        <path d="M-2 40 C-2 33 7.4 29 20 29 C32.6 29 42 33 42 40 Z" fill={CLOTH} />
        {/* 脖子。先画，被下巴压住上端 */}
        <path d="M17 22 L23 22 L23 29.4 L17 29.4 Z" fill={SHADE} />
        {/* 领口。一个 V，说明是校服领不是圆领 */}
        <path d="M15.2 29.6 L20 34.4 L24.8 29.6 L23 28.9 L20 32.2 L17 28.9 Z" fill={COLLAR} />
        {/* 耳朵。只露鬓角尖下面那一点点 ——
            第一版画大了、也画高了，头发一条竖边紧挨一块竖着的灰，
            在小尺寸上整个读成一副耳机。耳朵在这个尺度上不值得画全。 */}
        <ellipse cx="11.9" cy="19.9" rx="1.1" ry="1.45" fill={SHADE} />
        <ellipse cx="28.1" cy="19.9" rx="1.1" ry="1.45" fill={SHADE} />
        {/* 脸。头发画在它上面（见下），不在它后面 ——
            后面那种画法下缘一定是条直线，小尺寸上就成了两块方耳朵 */}
        <ellipse cx="20" cy="17.2" rx="8.8" ry="9.6" fill={FACE} />

        {variant === "man" && <FaceMan />}
        {variant === "yu" && <FaceYu />}
        {variant === "zhe" && <FaceZhe />}
      </g>
    </svg>
  );
}

/*
 * 头发都是一条闭合路径：外缘（共用）+ 发际线（每个人不一样）。
 * 外缘是一条从左鬓角绕过头顶到右鬓角的弧，两端停在耳朵中间的高度 ——
 * 停在这儿，发际线接上来的时候前面自然收成一个尖，就是鬓角，
 * 不用另外画。三个人换的只有发际线那一段。
 */
const HAIR_OUTER = "M10.9 19.8 C10.4 10.2 14.2 6.2 20 6.2 C25.8 6.2 29.6 10.2 29.1 19.8";

function Hair({ line }: { line: string }) {
  return <path d={`${HAIR_OUTER} ${line} Z`} fill={INK} />;
}

/** 小满：短发，刘海往一边扫开，露出额头。眉平、嘴角轻收 —— 「我自己能学」的自足。 */
function FaceMan() {
  return (
    <>
      <Hair
        line="L27.1 19.8 C26.9 15.2 25.8 12.7 22.6 13.7
              C18.8 14.9 15.2 13.7 13.1 15.9 C12.9 17.3 12.9 18.6 12.9 19.8"
      />
      <Brow d="M15.2 16.3 L18.2 16.2" />
      <Brow d="M21.8 16.2 L24.8 16.3" />
      <Eyes />
      <Nose />
      <Mouth d="M18.2 23.2 Q20 24.2 21.8 23.2" />
    </>
  );
}

/** 小雨：厚刘海压到眉毛，中间分一道缝。眉抬着、嘴张一点 —— 一卡住就想搜的那股急。 */
function FaceYu() {
  return (
    <>
      <Hair
        line="L27.3 19.8 C27.1 15.8 26.4 13.2 25 12.2
              C23.2 15.6 21.6 16.2 20.5 12.4 C19.4 16.2 17.2 15.6 15 12.2
              C13.6 13.2 12.9 15.8 12.7 19.8"
      />
      <Brow d="M15.2 16.6 Q16.7 15.7 18.2 16.4" />
      <Brow d="M21.8 16.4 Q23.3 15.7 24.8 16.6" />
      <Eyes r={1.3} />
      <Nose />
      <Mouth d="M18.3 23 Q20 24.9 21.7 23" />
    </>
  );
}

/** 阿哲：眼镜 + 侧分，眉压着、嘴角往下。「我怕问出来显得我笨」。 */
function FaceZhe() {
  return (
    <>
      <Hair
        line="L27.1 19.8 C27 15.4 26 11.8 23 11
              C19.2 10 15.6 11.8 14.2 14.6 C13.8 13 13.2 12.2 12.6 12.4
              C12.4 14.2 12.9 17.4 12.9 19.8"
      />
      <Brow d="M15.3 15.7 Q16.8 15.2 18.2 15.7" />
      <Brow d="M21.8 15.7 Q23.2 15.2 24.7 15.7" />
      <Eyes />
      <Nose />
      {/* 眼镜。三米外唯一还认得出的特征，所以线要够粗 */}
      <g fill="none" stroke={INK} strokeWidth="0.95" strokeLinejoin="round">
        <rect x="13.1" y="16.4" width="6" height="4.6" rx="1.6" />
        <rect x="20.9" y="16.4" width="6" height="4.6" rx="1.6" />
        <path d="M19.1 18.4 L20.9 18.4" strokeLinecap="round" />
        <path d="M13.1 17.7 L11.3 18.1" strokeLinecap="round" />
        <path d="M26.9 17.7 L28.7 18.1" strokeLinecap="round" />
      </g>
      <Mouth d="M18.3 23.9 Q20 23 21.7 23.9" />
    </>
  );
}

function Eyes({ r = 1.15 }: { r?: number }) {
  return (
    <>
      <ellipse cx="16.1" cy="18.6" rx={r} ry={r * 1.15} fill={INK} />
      <ellipse cx="23.9" cy="18.6" rx={r} ry={r * 1.15} fill={INK} />
    </>
  );
}

/** 鼻子只留一小道影。画成一个形就会在小尺寸上变成一块脏点。 */
function Nose() {
  return (
    <path
      d="M20 19.8 L20 21.3"
      fill="none"
      stroke={SHADE}
      strokeWidth="0.85"
      strokeLinecap="round"
    />
  );
}

function Brow({ d }: { d: string }) {
  return <path d={d} fill="none" stroke={INK} strokeWidth="1" strokeLinecap="round" />;
}

function Mouth({ d }: { d: string }) {
  return <path d={d} fill="none" stroke={INK} strokeWidth="0.95" strokeLinecap="round" />;
}
