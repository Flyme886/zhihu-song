/**
 * 议题数据的唯一入口 —— 只有公开的那一半。
 *
 * topic.public.json 由 scripts/split-topic.mjs 从 src/data/mock-topic.json 生成
 * （build / dev 前自动跑，别手改生成物）。而 mock-topic.json 本身是
 * docs/design/mock-topic.json 的副本，由 scripts/sync-contract.sh 同步。
 * 接真实数据时改 docs/design 那一份，整条链自己会跟上。
 *
 * 这里拿不到 has / lacks / reveal / cells —— 那些在结算时才 fetch，
 * 走 @/lib/secret。类型上就是 PublicTopic，读隐藏字段会编译不过。
 *
 * 这个文件存在的理由：把「JSON 断言成类型」这件事收在一处。
 * 别在组件里到处写 `as unknown as ...` —— 那样契约一变就得满仓库找。
 */
import raw from "@/data/topic.public.json";
import type { Evidence } from "@/lib/model";
import type { PublicTopic } from "@/lib/secret";

// 先过 unknown 是必要的：TS 无法从 JSON 的字面量类型直接窄化到带联合类型的契约。
export const topic = raw as unknown as PublicTopic;

export const askers = topic.askers;
export const nodes = topic.nodes;

/** 首个节点，首轮只做一个节点的闭环 */
export const firstNode = topic.nodes[0];

/**
 * answer_id → 出处。卡上只存 evidence_answer_id，署名和赞数得查这张表。
 * 议题一次性加载，建成 Map 比每次 find 省事，也省得组件里各查一遍。
 */
const evidenceById = new Map<string, Evidence>(
  topic.evidence.map((e) => [e.answer_id, e]),
);

export function evidenceFor(answerId: string): Evidence | undefined {
  return evidenceById.get(answerId);
}
