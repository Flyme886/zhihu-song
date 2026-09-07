#!/usr/bin/env node
/**
 * 拉取并留存黑客松故事原始快照。
 * 它不写入前端包；.data 已 gitignore。前端只会看到人工选定的短引文和署名。
 */
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const STORIES = [
  "2025684191967294692", // 蓝血
  "1930445234262750503", // 俺妈和她的丧尸闺女
  "2050600604976803918", // 不提分就出不去的房间
  "1985108790006277782", // 端妃黑又壮
];
const API_ROOT = "https://api.zhihu.com/km-indep-home/hackathon/v2/story";

function requireSafeWorkId(value) {
  if (!/^[0-9]+$/.test(value)) throw new Error("work_id 必须是来自官方列表的纯数字标识。");
}

async function getJson(url) {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`知乎故事接口失败：HTTP ${response.status}`);
  return response.json();
}

const list = await getJson(`${API_ROOT}/list`);
if (!Array.isArray(list)) throw new Error("知乎故事列表响应不是数组，拒绝拉取详情。");

const saved = [];
for (const workId of STORIES) {
  requireSafeWorkId(workId);
  if (!list.some((item) => item?.work_id === workId)) {
    throw new Error(`目标 work_id 不在官方故事列表中：${workId}`);
  }
  const detail = await getJson(`${API_ROOT}/${encodeURIComponent(workId)}`);
  if (!detail || detail.work_id !== workId || typeof detail.content !== "string") {
    throw new Error(`知乎故事详情字段不完整：${workId}`);
  }
  const snapshot = {
    fetched_at: new Date().toISOString(),
    source_api: `${API_ROOT}/${workId}`,
    content_sha256: createHash("sha256").update(detail.content).digest("hex"),
    story: detail,
  };
  const out = resolve(import.meta.dirname, "..", ".data", "zhihu-stories", `${workId}.json`);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  saved.push({ saved: out, work_id: detail.work_id, title: detail.chapter_name, author: detail.author_name, content_sha256: snapshot.content_sha256 });
}
console.log(JSON.stringify(saved));
