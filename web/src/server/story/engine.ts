import type {
  Outcome,
  Placement,
  SettlementRow,
  StoryPackDefinition,
} from "@/server/story/types";

const OUTCOME_LABEL: Record<Outcome, string> = {
  seen: "照见",
  misread: "错读",
  hurt: "刺痛",
};

function fail(message: string): never {
  throw new Error(message);
}

/**
 * 四个故事包共用的确定性结算模块。
 * 变化只存在于 StoryPackDefinition 数据中；这里不认识任何作品名、人物或剧情。
 */
export function settlePack(definition: StoryPackDefinition, placements: Placement[]): {
  rows: SettlementRow[];
  discardedCardId: string;
} {
  const { publicPack, privateLanes, privateCards } = definition;
  if (placements.length !== publicPack.lanes.length) fail("必须恰好投递三张解读卡。");

  const laneIds = placements.map((placement) => placement.laneId);
  const cardIds = placements.map((placement) => placement.cardId);
  if (new Set(laneIds).size !== publicPack.lanes.length || new Set(cardIds).size !== privateCards.length - 1) {
    fail("每条阅读线只能收到一张卡，且必须压下一张不同的卡。");
  }

  const rows = placements.map((placement): SettlementRow => {
    const lane = privateLanes.find((candidate) => candidate.id === placement.laneId)
      ?? fail(`未知阅读线：${placement.laneId}`);
    const publicLane = publicPack.lanes.find((candidate) => candidate.id === placement.laneId)
      ?? fail(`公开故事包缺少阅读线：${placement.laneId}`);
    const card = privateCards.find((candidate) => candidate.id === placement.cardId)
      ?? fail(`未知解读卡：${placement.cardId}`);
    const outcome: Outcome = card.requires.every((signal) => lane.has.includes(signal))
      ? "seen"
      : card.strains.some((signal) => lane.lacks.includes(signal))
        ? "hurt"
        : "misread";

    const because = outcome === "seen"
      ? `“${card.title}”依赖的条件，在“${publicLane.title}”这条阅读线中已具备；它让这部分信息先被看见。`
      : outcome === "hurt"
        ? `“${card.title}”压住了“${publicLane.title}”本就缺少的条件，因此理解没有消失，却变得更难承受。`
        : `“${card.title}”没有接上“${publicLane.title}”真正缺少的条件，于是它停留在一句合理、但没被读进去的话。`;

    return {
      laneId: lane.id,
      laneTitle: publicLane.title,
      cardId: card.id,
      cardTitle: card.title,
      outcome,
      outcomeLabel: OUTCOME_LABEL[outcome],
      because,
      reveal: lane.reveal,
    };
  });

  const discardedCard = privateCards.find((card) => !cardIds.includes(card.id));
  if (!discardedCard) fail("找不到被压下的解读卡。");
  return { rows, discardedCardId: discardedCard.id };
}
