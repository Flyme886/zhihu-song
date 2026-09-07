import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { packById } from "@/server/story/catalog";
import { settlePack } from "@/server/story/engine";
import type { PackId, Placement, RunReview, RunStart } from "@/server/story/types";

type RunRow = { id: string; pack_id: PackId; settled_at: string | null; result_json: string | null };

let database: DatabaseSync | null = null;

function db(): DatabaseSync {
  if (database) return database;
  const file = process.env.STORY_DB_PATH ?? join(process.cwd(), ".data", "story-runs.sqlite");
  mkdirSync(dirname(file), { recursive: true });
  database = new DatabaseSync(file);
  database.exec(`
    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      pack_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      settled_at TEXT,
      result_json TEXT
    ) STRICT;
    CREATE TABLE IF NOT EXISTS placements (
      run_id TEXT NOT NULL,
      lane_id TEXT NOT NULL,
      card_id TEXT NOT NULL,
      PRIMARY KEY (run_id, lane_id),
      UNIQUE (run_id, card_id),
      FOREIGN KEY (run_id) REFERENCES runs(id)
    ) STRICT;
  `);
  return database;
}

function requirePack(packId: string) {
  const definition = packById(packId);
  if (!definition) throw new Error("当前故事包不存在。");
  return definition;
}

function runById(runId: string): RunRow {
  const row = db().prepare("SELECT id, pack_id, settled_at, result_json FROM runs WHERE id = ?").get(runId) as RunRow | undefined;
  if (!row) throw new Error("试玩局不存在或已经失效。");
  return row;
}

export function startRun(packId: string): RunStart {
  const definition = requirePack(packId);
  const runId = randomUUID();
  db().prepare("INSERT INTO runs (id, pack_id, created_at) VALUES (?, ?, ?)").run(runId, definition.publicPack.id, new Date().toISOString());
  return { runId, pack: definition.publicPack };
}

export function settleRun(runId: string, placements: Placement[]): RunReview {
  const run = runById(runId);
  if (run.settled_at && run.result_json) return JSON.parse(run.result_json) as RunReview;

  const definition = requirePack(run.pack_id);
  const settled = settlePack(definition, placements);
  const settledAt = new Date().toISOString();
  const review: RunReview = {
    runId,
    packId: run.pack_id,
    settledAt,
    rows: settled.rows,
    discardedCardId: settled.discardedCardId,
    attributionNotice: definition.publicPack.attributionNotice,
  };

  const connection = db();
  connection.exec("BEGIN IMMEDIATE");
  try {
    const insert = connection.prepare("INSERT INTO placements (run_id, lane_id, card_id) VALUES (?, ?, ?)");
    for (const placement of placements) insert.run(runId, placement.laneId, placement.cardId);
    connection.prepare("UPDATE runs SET settled_at = ?, result_json = ? WHERE id = ?")
      .run(settledAt, JSON.stringify(review), runId);
    connection.exec("COMMIT");
  } catch (error) {
    connection.exec("ROLLBACK");
    throw error;
  }
  return review;
}

export function reviewRun(runId: string): RunReview {
  const run = runById(runId);
  if (!run.result_json) throw new Error("这一局尚未结算。");
  return JSON.parse(run.result_json) as RunReview;
}
