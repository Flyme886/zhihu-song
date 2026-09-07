import { Scene } from "@/components/Scene";

/**
 * 第二步：桌上摆好三个提问者和四张手牌，静态的。
 *
 * 上一步的验收标准（投影仪上第一眼是一张桌子，不是深色主题的网页）继续有效。
 * 这一步多验一条：3 米外卡面上的字读不读得清。
 * 点卡可以举到眼前看逐字引文。拖拽和结算还没做。
 */
export default function Page() {
  return (
    <main className="h-full">
      <Scene />
    </main>
  );
}
