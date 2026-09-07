import type {
  InterpretationCard,
  PackId,
  PrivateCard,
  PrivateLane,
  PublicLane,
  PublicStoryPack,
  StoryPackDefinition,
} from "@/server/story/types";

const API_ROOT = "https://api.zhihu.com/km-indep-home/hackathon/v2/story";

type PackInput = Omit<PublicStoryPack, "cards" | "lanes" | "attributionNotice"> & {
  lanes: PublicLane[];
  cards: PrivateCard[];
  privateLanes: PrivateLane[];
};

function definePack(input: PackInput): StoryPackDefinition {
  const { cards: privateCards, privateLanes, ...publicFields } = input;
  const cards: InterpretationCard[] = privateCards.map((card) => ({
    id: card.id,
    title: card.title,
    body: card.body,
    provenance: card.provenance,
  }));
  const attributionNotice = `故事原作：知乎故事《${publicFields.source.title}》· ${publicFields.source.authorName}。短引文来自黑客松故事接口；其余文字均标为本游戏的阅读解读，不是原作续写。`;
  return {
    publicPack: { ...publicFields, cards, attributionNotice },
    privateLanes,
    privateCards,
  };
}

const blueBlood = definePack({
  id: "blue-blood",
  version: 1,
  source: {
    provider: "zhihu_hackathon_story",
    workId: "2025684191967294692",
    title: "蓝血",
    authorName: "桃花先生",
    labels: ["悬疑", "惊悚", "脑洞", "大女主", "医生", "反转", "烧脑", "现代"],
    apiUrl: `${API_ROOT}/2025684191967294692`,
    fetchedAt: "2026-09-07",
    contentHash: "4a6faadedd592d2ca88798c652c8cec134182d4772a769b6eaca4220c4ff86e3",
  },
  contentWarning: ["悬疑压迫", "出血描写", "被注视与被误解"],
  chapterTitle: "第一章：急救培训之后",
  chapterPremise: "一个人发现自己对血色的认知，与周围所有人的共同常识相反。玩家不替她决定真相，只决定哪种理解先被送达。",
  excerpts: [
    { quote: "人的血液是蓝色的", locator: "急救培训", attribution: "知乎故事《蓝血》· 桃花先生" },
    { quote: "我恐怕，是个异类。", locator: "洗手间后的自我判断", attribution: "知乎故事《蓝血》· 桃花先生" },
    { quote: "这个世界，绝对，不是我所熟悉的那个。", locator: "异常扩展", attribution: "知乎故事《蓝血》· 桃花先生" },
  ],
  lanes: [
    { id: "self-confirmation", title: "自我确认", prompt: "在无人相信之前，她先要确认自己看见了什么。" },
    { id: "public-disguise", title: "公开伪装", prompt: "在群体的共同常识里，她要怎样让自己不先被看成异类。" },
    { id: "outside-gaze", title: "他人注视", prompt: "旁观者会把异常当作线索、风险，还是一个应被纠正的错误。" },
  ],
  cards: [
    { id: "preserve-evidence", title: "留下可回看的记录", body: "先记下能被再次核对的细节，不急着替它下结论。", provenance: "game_interpretation", requires: ["evidence"], strains: ["institutional_trust"] },
    { id: "keep-a-low-profile", title: "暂时让自己看起来正常", body: "在信息不足时，先减少不必要的公开暴露。", provenance: "game_interpretation", requires: ["self_control"], strains: ["trusted_contact"] },
    { id: "find-one-witness", title: "只交给一个可信的人", body: "先寻找能共同核验的人，而不是立刻要求所有人相信。", provenance: "game_interpretation", requires: ["trusted_contact"], strains: ["institutional_trust"] },
    { id: "defer-to-consensus", title: "先把共同常识当作答案", body: "当多数人都认同一件事时，先暂停自己的判断。", provenance: "game_interpretation", requires: ["institutional_trust"], strains: ["evidence"] },
  ],
  privateLanes: [
    { id: "self-confirmation", has: ["evidence", "self_control"], lacks: ["trusted_contact"], reveal: "这条线不缺观察力，缺的是一个可以共同验证的安全关系。" },
    { id: "public-disguise", has: ["self_control", "institutional_trust"], lacks: ["evidence"], reveal: "这条线很会融入群体，却容易把群体的解释误当成自己的证据。" },
    { id: "outside-gaze", has: ["evidence", "trusted_contact"], lacks: ["institutional_trust"], reveal: "这条线愿意保留异常，但尚未准备好承受制度与群体的反作用。" },
  ],
});

const zombieDaughter = definePack({
  id: "zombie-daughter",
  version: 1,
  source: {
    provider: "zhihu_hackathon_story",
    workId: "1930445234262750503",
    title: "俺妈和她的丧尸闺女",
    authorName: "归像",
    labels: ["现实情感", "草根", "家庭", "丧尸", "求生", "治愈", "励志", "末日"],
    apiUrl: `${API_ROOT}/1930445234262750503`,
    fetchedAt: "2026-09-07",
    contentHash: "175715829253a6320cfcaf8f99d8cd15b04e04706361a3b936b9fb5801f72a35",
  },
  contentWarning: ["末日设定", "身体异常", "照护与群体风险"],
  chapterTitle: "第一章：妈妈说她只是病了",
  chapterPremise: "同一个异常在母亲、女儿与外部观察者眼中被叫成不同的名字。玩家只决定哪一种回应先被送达。",
  excerpts: [
    { quote: "俺妈不懂。", locator: "母亲发现女儿后", attribution: "知乎故事《俺妈和她的丧尸闺女》· 归像" },
    { quote: "谁敢动俺闺女！", locator: "外部观察者介入", attribution: "知乎故事《俺妈和她的丧尸闺女》· 归像" },
    { quote: "俺肯定能治好俺妮儿！", locator: "母亲的坚持", attribution: "知乎故事《俺妈和她的丧尸闺女》· 归像" },
  ],
  lanes: [
    { id: "maternal-care", title: "母亲的照护", prompt: "她首先看见的，始终是自己的女儿。" },
    { id: "daughter-voice", title: "女儿的声音", prompt: "异常没有抹去她与母亲之间的关系。" },
    { id: "clinical-boundary", title: "外部边界", prompt: "外部观察者必须同时面对例外、风险与群体安全。" },
  ],
  cards: [
    { id: "keep-observing", title: "先把变化记下来", body: "先区分看见了什么与猜测了什么。", provenance: "game_interpretation", requires: ["observation"], strains: ["urgent_action"] },
    { id: "name-the-risk", title: "把风险说清楚", body: "照护不等于回避边界，边界也不等于否定关系。", provenance: "game_interpretation", requires: ["risk_language"], strains: ["trust"] },
    { id: "keep-one-connection", title: "保留一条可回应的关系", body: "在失控之前，先确认还有谁能听见谁。", provenance: "game_interpretation", requires: ["trust"], strains: ["observation"] },
    { id: "wait-for-certainty", title: "等一切确定再行动", body: "不完整的信息并不自动等于可以什么也不做。", provenance: "game_interpretation", requires: ["urgent_action"], strains: ["observation"] },
  ],
  privateLanes: [
    { id: "maternal-care", has: ["trust", "observation"], lacks: ["risk_language"], reveal: "照护是真的；她缺的是能把危险说出口、也不等于放弃女儿的语言。" },
    { id: "daughter-voice", has: ["trust", "urgent_action"], lacks: ["observation"], reveal: "她仍保留关系，但无法独自提供稳定、完整的自我说明。" },
    { id: "clinical-boundary", has: ["observation", "risk_language"], lacks: ["trust"], reveal: "这条线能说出风险，却还没有建立能被对方接住的信任。" },
  ],
});

const scorelessRoom = definePack({
  id: "scoreless-room",
  version: 1,
  source: {
    provider: "zhihu_hackathon_story",
    workId: "2050600604976803918",
    title: "不提分就出不去的房间",
    authorName: "灯灯",
    labels: ["言情", "学霸", "校园", "甜宠", "现代"],
    apiUrl: `${API_ROOT}/2050600604976803918`,
    fetchedAt: "2026-09-07",
    contentHash: "10bf691ab5d52029894c5ffff102a6cc311ced26d4a0c75b9783a69a8f4bef44",
  },
  contentWarning: ["校园压力", "关系张力", "封闭空间"],
  chapterTitle: "第一章：被打码的惩罚",
  chapterPremise: "两个人被投入一间必须共同达成目标才能离开的房间。玩家不替他们攻略关系，只检查什么样的协作先接上。",
  excerpts: [
    { quote: "不提分就出不去", locator: "房间规则", attribution: "知乎故事《不提分就出不去的房间》· 灯灯" },
    { quote: "你想都别想。", locator: "被隐藏的提示", attribution: "知乎故事《不提分就出不去的房间》· 灯灯" },
    { quote: "我一定会让你提分。", locator: "共同目标", attribution: "知乎故事《不提分就出不去的房间》· 灯灯" },
  ],
  lanes: [
    { id: "learning-need", title: "学习需要", prompt: "真正卡住的地方，未必等于表面上的分数。" },
    { id: "room-rule", title: "房间规则", prompt: "明确的目标，也可能把关系压成唯一的标准。" },
    { id: "relationship-tension", title: "关系张力", prompt: "靠近、比较与不愿承认的心事同时在场。" },
  ],
  cards: [
    { id: "ask-the-hidden-cost", title: "先问被藏起来的代价", body: "在答应规则前，先确认它要求两个人各失去什么。", provenance: "game_interpretation", requires: ["questioning"], strains: ["time"] },
    { id: "trade-explanations", title: "把讲题变成交换", body: "把单向帮助改成彼此说清自己卡在哪一步。", provenance: "game_interpretation", requires: ["communication"], strains: ["comparison"] },
    { id: "protect-a-rest", title: "留下一段不谈分数的时间", body: "共同目标不应该吞掉每一次休息与沉默。", provenance: "game_interpretation", requires: ["time"], strains: ["urgency"] },
    { id: "make-score-the-only-rule", title: "只看结果能不能上升", body: "当分数成为唯一坐标，其他解释都会被压扁。", provenance: "game_interpretation", requires: ["urgency"], strains: ["communication"] },
  ],
  privateLanes: [
    { id: "learning-need", has: ["questioning", "communication"], lacks: ["time"], reveal: "她不缺想学会的意愿，缺的是一段不被焦虑立刻打断的时间。" },
    { id: "room-rule", has: ["urgency", "time"], lacks: ["questioning"], reveal: "规则很清楚，却不保证它问过正确的问题。" },
    { id: "relationship-tension", has: ["communication", "urgency"], lacks: ["comparison"], reveal: "关系里的比较已经存在，但还没有被承认为会改变协作。" },
  ],
});

const darkStrongConsort = definePack({
  id: "dark-strong-consort",
  version: 1,
  source: {
    provider: "zhihu_hackathon_story",
    workId: "1985108790006277782",
    title: "端妃黑又壮",
    authorName: "重十八",
    labels: ["言情", "大女主", "BE", "虐恋", "暗恋", "多视角反转", "治愈", "古代"],
    apiUrl: `${API_ROOT}/1985108790006277782`,
    fetchedAt: "2026-09-07",
    contentHash: "24462422e36103830f6243f835f4d785d0422c9455db1cfc9d6eabded8b02970",
  },
  contentWarning: ["宫廷权力关系", "外貌评价", "情感挫折"],
  chapterTitle: "第一章：被留下的那一天",
  chapterPremise: "同一次被留下，在她自己、宫廷目光与远方来信中各有不同的意义。玩家不改写关系，只安排哪一层理解先抵达。",
  excerpts: [
    { quote: "黑又壮入宫后", locator: "作品导语", attribution: "知乎故事《端妃黑又壮》· 重十八" },
    { quote: "留。", locator: "选秀现场", attribution: "知乎故事《端妃黑又壮》· 重十八" },
    { quote: "我会种萝卜，怕啥？", locator: "入宫前", attribution: "知乎故事《端妃黑又壮》· 重十八" },
  ],
  lanes: [
    { id: "self-definition", title: "她如何定义自己", prompt: "外界的命名并不自动决定她看待自己的方式。" },
    { id: "court-gaze", title: "宫廷如何看她", prompt: "身份与目光把一个人压缩成可被使用的角色。" },
    { id: "frontier-letter", title: "远方来信", prompt: "另一种目光也可能携带期待与误读。" },
  ],
  cards: [
    { id: "keep-own-language", title: "保留自己的说法", body: "先不急着用别人的评价翻译自己。", provenance: "game_interpretation", requires: ["self_knowledge"], strains: ["court_access"] },
    { id: "read-the-power", title: "先读权力在要求什么", body: "一句称赞或安排，也可能在规定一个人的位置。", provenance: "game_interpretation", requires: ["power_literacy"], strains: ["trust"] },
    { id: "answer-with-an-object", title: "用一件物件回应", body: "不替关系下定义，只让对方看见一个具体的你。", provenance: "game_interpretation", requires: ["trust"], strains: ["court_access"] },
    { id: "accept-the-first-label", title: "先接受别人给的标签", body: "被看见不一定等于被理解。", provenance: "game_interpretation", requires: ["court_access"], strains: ["self_knowledge"] },
  ],
  privateLanes: [
    { id: "self-definition", has: ["self_knowledge", "trust"], lacks: ["court_access"], reveal: "她有自己的语言，却不能假装权力关系不存在。" },
    { id: "court-gaze", has: ["court_access", "power_literacy"], lacks: ["trust"], reveal: "宫廷能安排位置，却未必愿意承认一个人完整的自我。" },
    { id: "frontier-letter", has: ["trust", "court_access"], lacks: ["power_literacy"], reveal: "远方的理解更松动，但也可能没看见宫廷权力的代价。" },
  ],
});

const CATALOG: Record<PackId, StoryPackDefinition> = {
  "blue-blood": blueBlood,
  "zombie-daughter": zombieDaughter,
  "scoreless-room": scorelessRoom,
  "dark-strong-consort": darkStrongConsort,
};

export function packById(id: string): StoryPackDefinition | undefined {
  return CATALOG[id as PackId];
}

export function listPacks(): PublicStoryPack[] {
  return Object.values(CATALOG).map((definition) => definition.publicPack);
}
