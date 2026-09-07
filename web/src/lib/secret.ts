/**
 * 暗牌：点结算那一刻才取的那份数据。
 *
 * 分两份的理由和边界写在 scripts/split-topic.mjs 里，一句话复述：
 * 答案不进 JS 包、不进初始 DOM，但挡不住打开网络面板的人。别当安全边界。
 *
 * 类型上也切开了 —— 组件手里拿到的是 PublicAsker，上面**没有** has / lacks，
 * 想读会直接编译不过。这比写注释提醒管用。
 */
import type { Asker, Capacity, Cell, EraCallback, Node, Topic } from "@/lib/model";

/** 提问者身上属于暗牌的字段，和 split-topic.mjs 里的 ASKER_SECRET 必须一致 */
type AskerSecretKeys = "has" | "lacks" | "reveal" | "coords_by_year";
/** 节点身上属于暗牌的字段，同上，对应 NODE_SECRET */
type NodeSecretKeys = "cells" | "callbacks";

export type PublicAsker = Omit<Asker, AskerSecretKeys>;
export type PublicNode = Omit<Node, NodeSecretKeys>;
export type PublicTopic = Omit<Topic, "askers" | "nodes"> & {
  askers: PublicAsker[];
  nodes: PublicNode[];
};

export type SecretAsker = Pick<Asker, "id" | AskerSecretKeys>;
export type SecretNode = Pick<Node, "year" | NodeSecretKeys>;

export interface Secret {
  topic_id: string;
  askers: SecretAsker[];
  nodes: SecretNode[];
}

/**
 * 静态导出没有 basePath，部署到子路径时（比如 /hebutong/）要靠这个前缀。
 * 留成环境变量是为了改部署位置时只动一处，不用回来翻代码。
 */
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const SECRET_URL = `${BASE}/data/topic.secret.json`;

/**
 * 存 Promise 而不是存结果：结算按钮被连点两下、或者预取和结算同时发生时，
 * 存结果会发两次请求，存 Promise 只发一次，后来的都等同一个。
 */
let pending: Promise<Secret> | null = null;

export function loadSecret(): Promise<Secret> {
  pending ??= fetch(SECRET_URL, { cache: "force-cache" })
    .then((r) => {
      if (!r.ok) throw new Error(`暗牌取不到：${r.status} ${SECRET_URL}`);
      return r.json() as Promise<Secret>;
    })
    .catch((err) => {
      // 失败要把 pending 清掉，否则这一局之后永远重试不了
      pending = null;
      throw err;
    });
  return pending;
}

/**
 * 预取。在玩家放下第一张卡时调用 —— 那时候离点结算还有好几秒，
 * 请求早就回来了，揭示不会卡一下。投影仪上那一顿最不该出现在这里。
 */
export function warmSecret(): void {
  void loadSecret().catch(() => {
    // 预取失败不吭声：结算时还会再取一次，那时候才需要告诉玩家
  });
}

/** 结算时把公开的一半和暗的一半拼回完整 Asker，给 resolve() / sweptYear() 用 */
export function fullAsker(pub: PublicAsker, secret: Secret): Asker {
  const s = secret.askers.find((a) => a.id === pub.id);
  if (!s) throw new Error(`暗牌里没有提问者 ${pub.id}`);
  return { ...pub, has: s.has, lacks: s.lacks, reveal: s.reveal, coords_by_year: s.coords_by_year };
}

/** 结算时把节点补成完整 Node（带 cells / callbacks），给 findCell() 用 */
export function fullNode(pub: PublicNode, secret: Secret): Node {
  const s = secret.nodes.find((n) => n.year === pub.year);
  if (!s) throw new Error(`暗牌里没有节点 ${pub.year}`);
  return { ...pub, cells: s.cells, callbacks: s.callbacks };
}

/**
 * 某个节点的失效回调（§4.6）。放在暗牌里 —— 哪张卡会过期本身就是剧透，
 * 配卡阶段不能漏。取暗牌时（结算已经取过一次，这里命中缓存）按年份查出来。
 * 没有回调就返回空数组，调用方据此决定要不要放过场屏。
 */
export function callbacksForYear(secret: Secret, year: number): EraCallback[] {
  return secret.nodes.find((n) => n.year === year)?.callbacks ?? [];
}

/** 揭示语：结算后才说得出口的那句「他缺的是什么」 */
export function revealOf(secret: Secret, askerId: string): string {
  const s = secret.askers.find((a) => a.id === askerId);
  if (!s) throw new Error(`暗牌里没有提问者 ${askerId}`);
  return s.reveal;
}

export type { Capacity, Cell, EraCallback };
