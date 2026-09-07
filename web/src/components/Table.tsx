import { TableSurface } from "@/components/TableSurface";
import { ASPECT } from "@/lib/table-layout";

/**
 * 透视容器。这个组件唯一的工作是把摊平的桌面旋成「坐在一张桌子前」。
 *
 * 为什么用 CSS 3D 而不是 Three.js：卡面上有大段中文，WebGL 里的中日韩排版是个坑，
 * 而且投影仪上要 3 米外读清。CSS 3D 的卡是真 DOM —— 文字能选、能点、能被读屏软件念。
 *
 * 两个参数决定「像桌子」还是「像一张桌子的照片」：
 *
 * 1. 取景。桌子必须撑满画面、近边切出画外。看得见完整的四条边 =
 *    在看一件摆在远处的家具；近边在画外 = 人就坐在桌前。这一条比透视角度重要得多。
 *
 * 2. rotateX 是权衡：角度大了像桌子，但卡面文字纵向压缩得读不了。
 *    24° 纵向压到 91%，中文在这个量级还读得清；再大就得给卡面单独做反向补偿。
 */
/**
 * 墙上的金属板缝。
 *
 * ── 为什么只到「板缝」这一档，不做管道铆钉 ──
 * 这面墙的工作是给桌子一个「这是一间屋子」的交代，然后闭嘴。
 * 参考图那种满墙管道会把视线从卡面上拉走 —— 而卡面才是唯一需要被读的东西。
 * 竖向的板缝够了：它给出室内感和一个纵向节奏，但没有任何一处比卡更亮。
 *
 * 全部走百分比，跟着墙缩放 —— 投影仪换分辨率不会错位。
 */
function RoomPanels() {
  // 左右各三道，往中间递减 —— 中间要留给三个立牌，那儿不能有竖线打岔
  const seams = [4, 12, 22, 78, 88, 96];
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {seams.map((x) => (
        <div
          key={x}
          className="absolute top-0 bottom-0"
          style={{
            left: `${x}%`,
            width: 2,
            // 一道暗缝加一道高光 —— 金属板对缝是「凹进去再翻出来」
            background:
              "linear-gradient(to right, rgb(0 0 0 / 0.22), rgb(255 255 255 / 0.3))",
          }}
        />
      ))}
      {/* 顶上一条暗带，把画面上沿收住，不让墙一路亮到出画 */}
      <div
        className="absolute inset-x-0 top-0"
        style={{
          height: "22%",
          background:
            "linear-gradient(to bottom, rgb(20 22 26 / 0.9), transparent)",
        }}
      />
      {/* 两侧压暗，中间那段墙才是最亮的 —— 立牌衬在最亮处，轮廓最清楚 */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to right, rgb(20 22 26 / 0.55), transparent 26%, transparent 74%, rgb(20 22 26 / 0.55))",
        }}
      />
    </div>
  );
}

export function Table({
  children,
  surgeNonce = 0,
}: {
  children?: React.ReactNode;
  /**
   * 变一次，墙上的灯闪一下 —— 点结算那一刻用。
   *
   * 为什么是灯闪而不是别的：这一屏唯一的光源就是桌上那盏灯，
   * 而墙面那片漫射光是它唯一看得见的证据。要让「刚才那一下很重」这件事
   * 作用在整个房间上，只能动这盏灯。
   */
  surgeNonce?: number;
}) {
  return (
    <div
      className="relative h-full w-full overflow-hidden"
      style={{ background: "var(--color-void)" }}
    >
      {/* 墙。桌子之所以像桌子，一半靠这面墙 ——
          近黑的桌子压在亮墙上，边界靠明暗反差立住，不靠描边。
          没有它，深色桌面和深色页面背景糊成一片，就成了「深色网页」。

          冷灰而不是暖白：桌上唯一的暖色现在是那盏灯，墙冷了灯才显得是暖的。 */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[31%]"
        style={{
          background:
            "linear-gradient(to bottom, #ced2d8 0%, #b9bec6 46%, #83898f 78%, #3f4348 100%)",
        }}
      >
        {/* 墙上的一片漫射光，对应桌上那盏灯。灯在桌子上方偏后，光打在墙根最亮。
            key 带上 surgeNonce：点结算时重新挂载，灯就闪一下（见 amb-surge）。 */}
        <div
          key={surgeNonce}
          className="amb-surge absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 46% 92% at 50% 104%, rgb(236 242 250 / 0.5), transparent 72%)",
            animation:
              surgeNonce > 0 ? "amb-surge 900ms ease-out both" : undefined,
          }}
        />
        <RoomPanels />
        {/* 墙脚的接缝暗线 */}
        <div
          className="absolute inset-x-0 bottom-0 h-px"
          style={{ background: "rgb(0 0 0 / 0.5)" }}
        />
      </div>

      {/* 舞台：perspective 建立观察点。值越小透视越夸张。 */}
      <div
        className="absolute inset-0"
        style={{ perspective: "940px", perspectiveOrigin: "50% 30%" }}
      >
        {/* 桌面。
            宽度超过视口 → 左右两侧切出画外；
            top 20% + transformOrigin 顶边 → 以远边为轴倾倒，近边被推到画面下方外面。 */}
        <div
          className="absolute"
          style={{
            left: "50%",
            // 21% → 25%：桌子往后退，上方多露出一截屋子。
            // 再往下就有风险 —— 近边必须被推到画外（见文件头取景那条），
            // 25% 是量出来的上限，26% 开始能看见桌子近边那条线。
            top: "25%",
            // 宽高比必须来自 TABLE，不能另写一个数：
            // 一旦容器比例和 viewBox 不一致，preserveAspectRatio="none"
            // 会把两个轴按不同倍数拉伸，桌上的卡槽就从竖变横了。
            //
            // 宽度是量出来的，不是算出来的 —— perspective 会把近边往外拉，
            // CSS 宽 1180 投影出来约 1440，刚好填满画面又不裁掉刻线。
            //
            // 第三项是给「宽而矮」的视口兜底，两头都会顶出画外：
            //   桌子上方 —— 立牌从远边往上探出约 0.144 × 桌宽，头顶只有 25vh；
            //   桌子下方 —— 结算面板摊在近边那一排，位置也是按桌宽算的，
            //               而定版句「这条建议没写错」是全场的落点，被切掉就白做了。
            // 两条里下面那条更紧：量出来面板底 ≈ 0.527 × 桌宽 + 25vh，
            // 要留 12px 余量就得 w ≤ 142vh − 23px。这一项同时管住了立牌。
            // 竖高一点的视口（≥ 约 890px）它不起作用，画面和以前一样。
            //
            // 为什么是量的不是算的：面板高度取决于字怎么换行，
            // 桌子一窄字就多折一行，不是宽度的线性函数 —— 所以取实测里最差的一档。
            width: "min(86vw, 1240px, calc(142vh - 23px))",
            aspectRatio: ASPECT,
            transform: "translateX(-50%) rotateX(24deg)",
            transformOrigin: "50% 0%",
            transformStyle: "preserve-3d",
            borderRadius: "10px 10px 0 0",
            // 桌子压在墙上投出的影子 + 桌下的地面阴影
            boxShadow:
              "0 -14px 46px rgb(0 0 0 / 0.55), 0 60px 130px rgb(0 0 0 / 0.75)",
          }}
        >
          {/* 远边接光：桌沿顶面对着亮墙，会亮出一条细线。
              这条线是「桌子有厚度」的唯一可见证据 —— 其余三条边都在画外。 */}
          <div
            className="pointer-events-none absolute inset-x-0 top-0 z-10"
            style={{
              height: "3px",
              borderRadius: "10px 10px 0 0",
              background:
                "linear-gradient(to bottom, rgb(214 224 236 / 0.6), rgb(96 104 114 / 0.2))",
            }}
          />

          <div className="absolute inset-0 overflow-hidden rounded-t-[10px]">
            <TableSurface />
          </div>

          {/* 卡牌、提问者立牌叠在这一层。preserve-3d 让子元素能各自 translateZ 抬起。 */}
          <div
            className="absolute inset-0"
            style={{ transformStyle: "preserve-3d" }}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
