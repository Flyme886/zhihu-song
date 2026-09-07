/** 服务端故事包契约。前端永远只收到 PublicStoryPack。 */

export type PackId = "blue-blood" | "zombie-daughter" | "scoreless-room" | "dark-strong-consort";
export type LaneId = string;
export type Outcome = "seen" | "misread" | "hurt";

export type SourceExcerpt = {
  quote: string;
  locator: string;
  attribution: string;
};

export type StorySource = {
  provider: "zhihu_hackathon_story";
  workId: string;
  title: string;
  authorName: string;
  labels: string[];
  apiUrl: string;
  fetchedAt: string;
  contentHash: string;
};

export type PublicLane = {
  id: LaneId;
  title: string;
  prompt: string;
};

export type InterpretationCard = {
  id: string;
  title: string;
  body: string;
  provenance: "game_interpretation";
};

export type PublicStoryPack = {
  id: PackId;
  version: number;
  source: StorySource;
  contentWarning: string[];
  chapterTitle: string;
  chapterPremise: string;
  excerpts: SourceExcerpt[];
  lanes: PublicLane[];
  cards: InterpretationCard[];
  attributionNotice: string;
};

export type Placement = {
  laneId: LaneId;
  cardId: string;
};

export type SettlementRow = {
  laneId: LaneId;
  laneTitle: string;
  cardId: string;
  cardTitle: string;
  outcome: Outcome;
  outcomeLabel: string;
  because: string;
  reveal: string;
};

export type RunStart = {
  runId: string;
  pack: PublicStoryPack;
};

export type RunReview = {
  runId: string;
  packId: PackId;
  settledAt: string;
  rows: SettlementRow[];
  discardedCardId: string;
  attributionNotice: string;
};

/** 只供服务端判定读取的故事包部分，永远不可从 Route Handler 下发。 */
export type PrivateLane = {
  id: LaneId;
  has: string[];
  lacks: string[];
  reveal: string;
};

export type PrivateCard = InterpretationCard & {
  requires: string[];
  strains: string[];
};

export type StoryPackDefinition = {
  publicPack: PublicStoryPack;
  privateLanes: PrivateLane[];
  privateCards: PrivateCard[];
};
