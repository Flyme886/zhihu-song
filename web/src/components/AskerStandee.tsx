// PublicAsker 而不是 Asker：立牌上只该有玩家看得见的信息（名字 + 三行自述）。
// 用窄类型，就算以后手滑写了 asker.lacks 也会当场编译不过。
import { lastChar } from "@/lib/text";
import type { PublicAsker } from "@/lib/secret";
import { toPercent, type Rect } from "@/lib/table-layout";
import { AskerPortrait, variantFor } from "./AskerPortrait";

/**
 * 提问者立牌。像桌游里的纸质桌牌 —— 铰在桌子远边上折起来站着。
 *
 * ── 红圆里是一张画 ──
 * 手绘 SVG 头像，见 AskerPortrait。不是照片：立牌底下印着「虚构人物」，
 * 贴真人的脸会让那句话变成假话，而且这三个是未成年学生（详见那个文件的头注）。
 * 认不出 id 的时候退回姓名末字 —— 加了第四个提问者也不会开天窗。
 *
 * ── 为什么是暗色 ──
 * 第一版做成白卡，三块白板压在桌子远端，比手牌还抢眼。
 * 桌面上最亮的必须是回答卡 —— 暗色桌牌衬在亮墙上靠轮廓出形，正好反过来。
 *
 * ── 3D ──
 * 桌面 rotateX(24deg)，桌牌 rotateX(-24deg) 抵消掉，正对观众，字不被压扁。
 * transformOrigin 在底边，所以是从桌面「折起来」，不是悬空。
 * 位置见 STANDEE_SLOTS（y 是负的，身子在桌面之外）。
 *
 * ── 硬约束 ──
 * 只渲染 asker.visible。has / lacks 是暗信息，绝不能进 DOM。
 */
export function AskerStandee({
  asker,
  slot,
  hot = false,
}: {
  asker: PublicAsker;
  slot: Rect;
  /**
   * 正要把卡给这个人。
   *
   * 落点框自己也会亮，但拖着的那张卡正好压在框上面 —— 亮给谁看。
   * 立牌铰在桌子远边、在放卡处的上方，怎么拖都不会被卡挡住，
   * 所以「要给谁」这件事由立牌来说。而且这么讲也更对：卡是给一个人的，
   * 不是丢进一个格子里。
   */
  hot?: boolean;
}) {
  const pos = toPercent(slot);
  const variant = variantFor(asker.id);

  return (
    <div
      className="absolute"
      style={{
        ...pos,
        containerType: "inline-size",
        transformStyle: "preserve-3d",
        transformOrigin: "50% 100%",
        // 被选中时立牌往前立起一点（少倒 5°），像被点到名抬了下头
        transform: hot ? "rotateX(-19deg)" : "rotateX(-24deg)",
        transition: "transform 180ms cubic-bezier(0.22, 1, 0.36, 1)",
        zIndex: 5,
      }}
    >
      <div
        className="flex h-full w-full flex-col overflow-hidden"
        style={{
          borderRadius: "2cqw 2cqw 0 0",
          // 近黑的冷灰，比桌面亮一点点，够跟亮墙分开就行
          background: hot
            ? "linear-gradient(#23262c, #14161a)"
            : "linear-gradient(#1a1d22, #101216)",
          borderTop: `1px solid ${hot ? "var(--color-red)" : "rgb(207 214 222 / 0.3)"}`,
          boxShadow: hot
            ? "0 2cqw 5cqw rgb(0 0 0 / 0.65), 0 0 0 2px var(--color-red), 0 0 40px rgb(208 32 44 / 0.45)"
            : "0 2cqw 5cqw rgb(0 0 0 / 0.65)",
          padding: "4cqw 4cqw 3cqw",
          transition: "background 160ms, box-shadow 160ms, border-color 160ms",
        }}
      >
        {/* 名字压在最上面一条 —— 参考图里名字是立牌的顶栏，不是圆下面的说明 */}
        <div
          className="shrink-0"
          style={{
            fontSize: "10cqw",
            fontWeight: 700,
            letterSpacing: "0.08em",
            lineHeight: 1.05,
            textAlign: "center",
            color: hot ? "#fff" : "rgb(240 244 250 / 0.94)",
          }}
        >
          {asker.name}
        </div>

        {/* 红圆 + 头像。被点到名的时候圆变实、外面套一圈光 —— 一眼看到是谁 */}
        <div
          aria-hidden
          className="mx-auto flex shrink-0 items-center justify-center overflow-hidden"
          style={{
            marginTop: "2.2cqw",
            width: "40cqw",
            height: "40cqw",
            borderRadius: "50%",
            background: hot
              ? "var(--color-red)"
              : "radial-gradient(circle at 50% 42%, rgb(208 32 44 / 0.9), rgb(120 18 26 / 0.85))",
            boxShadow: hot
              ? "0 0 26px rgb(208 32 44 / 0.7)"
              : "inset 0 -1px 4px rgb(0 0 0 / 0.4)",
            fontSize: "19cqw",
            fontWeight: 700,
            color: "#fff",
            transition: "background 160ms, box-shadow 160ms",
          }}
        >
          {variant ? <AskerPortrait variant={variant} /> : lastChar(asker.name)}
        </div>

        {/* 摆在明面上的信息。玩家只能看到这些，配卡就是拿这些去猜 */}
        <ul
          className="min-h-0 flex-1 overflow-hidden"
          style={{
            marginTop: "2.2cqw",
            display: "flex",
            flexDirection: "column",
            gap: "1.1cqw",
          }}
        >
          {asker.visible.map((line) => {
            // 「」包起来的是本人原话，用宋体区分于客观标签
            const spoken = line.startsWith("「");
            return (
              <li
                key={line}
                style={{
                  position: "relative",
                  fontSize: "6.3cqw",
                  lineHeight: 1.28,
                  fontFamily: spoken ? "var(--font-serif)" : undefined,
                  color: spoken
                    ? "rgb(236 242 250 / 0.9)"
                    : "rgb(220 228 238 / 0.62)",
                  paddingLeft: spoken ? 0 : "3cqw",
                  textIndent: spoken ? "-0.42em" : 0,
                }}
              >
                {!spoken && (
                  <span
                    aria-hidden
                    style={{
                      position: "absolute",
                      left: 0,
                      top: "0.5em",
                      width: "1.5cqw",
                      height: "1.5cqw",
                      borderRadius: "50%",
                      background: "var(--color-red)",
                    }}
                  />
                )}
                {line}
              </li>
            );
          })}
        </ul>

        {/* 虚构标注。不是免责声明，是这个产品的底线 */}
        {asker.is_fictional && (
          <div
            className="shrink-0"
            style={{
              marginTop: "2.2cqw",
              paddingTop: "2cqw",
              borderTop: "1px solid rgb(207 214 222 / 0.15)",
              fontSize: "5.4cqw",
              letterSpacing: "0.1em",
              textAlign: "center",
              color: "rgb(220 228 238 / 0.42)",
            }}
          >
            虚构人物
          </div>
        )}
      </div>
    </div>
  );
}
