/**
 * 把议题数据切成两份：能进包的「公开」+ 结算时才取的「暗牌」。
 *
 * 为什么要切：整份 mock-topic.json 以前是 import 进来的，webpack 会把它原样
 * 打进 chunk。也就是说打开开发者工具搜一下，三个提问者缺什么、每张卡给谁会
 * 反噬、连揭示语原文，全在里面。第一次结算之前答案就已经在客户端了。
 *
 * 这次买到的是什么，说清楚：
 *   ✅ 答案不在 JS 包里，也不在初始 DOM / React 初始 state 里
 *   ✅ 不点结算就永远不发这个请求
 *   ❌ 不防「打开网络面板看一眼」，也不防直接猜 URL 访问
 * 静态导出没有服务端，做不到真藏。这一层挡的是随手一翻就被剧透，
 * 不是挡决心要看的人。别把它当安全边界。
 *
 * 用法：node scripts/split-topic.mjs       （build / dev 前自动跑）
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, "../src/data/mock-topic.json");
const PUBLIC_OUT = resolve(HERE, "../src/data/topic.public.json");
const SECRET_OUT = resolve(HERE, "../public/data/topic.secret.json");

/** 提问者身上属于暗牌的字段 */
const ASKER_SECRET = ["has", "lacks", "reveal", "coords_by_year"];
/** 节点身上属于暗牌的字段：cells 是整张答案表，callbacks 是节点切换才揭示的话 */
const NODE_SECRET = ["cells", "callbacks"];

/** 递归删掉所有 __ 开头的自检 / 备注字段（如 __coords_note、__verified） */
function stripInternal(v) {
  if (Array.isArray(v)) return v.map(stripInternal);
  if (v && typeof v === "object") {
    const out = {};
    for (const [k, val] of Object.entries(v)) {
      if (k.startsWith("__")) continue;
      out[k] = stripInternal(val);
    }
    return out;
  }
  return v;
}

function pick(obj, keys, where) {
  const out = {};
  for (const k of keys) {
    if (!(k in obj)) throw new Error(`${where} 缺字段 ${k} —— 数据结构变了，先改这个脚本再 build`);
    out[k] = obj[k];
  }
  return out;
}

function omit(obj, keys) {
  const out = { ...obj };
  for (const k of keys) delete out[k];
  return out;
}

const raw = JSON.parse(readFileSync(SRC, "utf8"));
const topic = stripInternal(raw);

// ── 公开份：够打完一局，但没有任何答案 ────────────────────────────
const publicTopic = {
  ...omit(topic, ["askers", "nodes"]),
  askers: topic.askers.map((a) => omit(a, ASKER_SECRET)),
  nodes: topic.nodes.map((n) => omit(n, NODE_SECRET)),
};

// ── 暗牌份：只有答案，不重复公开信息 ──────────────────────────────
const secret = {
  topic_id: topic.id,
  askers: topic.askers.map((a) => pick(a, ["id", ...ASKER_SECRET], `asker ${a.id}`)),
  nodes: topic.nodes.map((n) => pick(n, ["year", ...NODE_SECRET], `node ${n.year}`)),
};

// ── 自检：公开份里不许残留任何一句答案 ────────────────────────────
// 光删字段不够 —— 万一以后哪个字段里嵌了一份拷贝，得当场 build 失败，
// 而不是等上线后被人搜出来。
const publicText = JSON.stringify(publicTopic);
const leaks = [];

for (const key of [...ASKER_SECRET, ...NODE_SECRET]) {
  if (publicText.includes(`"${key}"`)) leaks.push(`字段名 ${key} 还在公开份里`);
}

const needles = [];
for (const a of topic.askers) needles.push([`${a.id}.reveal`, a.reveal]);
for (const n of topic.nodes) {
  for (const c of n.cells) {
    needles.push([`${n.year} ${c.card_id}→${c.asker_id} because`, c.because]);
    for (const [i, line] of c.narration.entries()) {
      needles.push([`${n.year} ${c.card_id}→${c.asker_id} narration[${i}]`, line]);
    }
  }
}
for (const [label, text] of needles) {
  if (typeof text === "string" && text.length > 8 && publicText.includes(text)) {
    leaks.push(`原文泄漏：${label}`);
  }
}

if (leaks.length) {
  console.error("✗ 公开份里有答案，拒绝写出：");
  for (const l of leaks) console.error(`  · ${l}`);
  process.exit(1);
}

// 缩进 2 空格 + 结尾换行：让生成物的 git diff 稳定可读
mkdirSync(dirname(SECRET_OUT), { recursive: true });
writeFileSync(PUBLIC_OUT, JSON.stringify(publicTopic, null, 2) + "\n");
writeFileSync(SECRET_OUT, JSON.stringify(secret, null, 2) + "\n");

const kb = (s) => (Buffer.byteLength(s) / 1024).toFixed(1) + "kB";
console.log(`✓ 公开份 src/data/topic.public.json      ${kb(publicText)}`);
console.log(`✓ 暗牌份 public/data/topic.secret.json   ${kb(JSON.stringify(secret))}`);
console.log(`  暗牌覆盖 ${secret.askers.length} 个提问者 / ${secret.nodes.length} 个节点`);
