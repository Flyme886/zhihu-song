import { settleRun } from "@/server/story/repository";
import type { Placement } from "@/server/story/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isPlacement(value: unknown): value is Placement {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.laneId === "string" && typeof candidate.cardId === "string";
}

export async function POST(request: Request, context: { params: Promise<{ runId: string }> }) {
  const { runId } = await context.params;
  try {
    const body: unknown = await request.json();
    const placements = body && typeof body === "object" ? (body as { placements?: unknown }).placements : undefined;
    if (!Array.isArray(placements) || !placements.every(isPlacement)) {
      return Response.json({ error: "INVALID_PLACEMENTS", message: "placements 必须是一组阅读线与卡片编号。" }, { status: 400 });
    }
    return Response.json(settleRun(runId, placements));
  } catch (error) {
    const message = error instanceof Error ? error.message : "结算失败。";
    const status = message.includes("不存在") ? 404 : 400;
    return Response.json({ error: "RUN_NOT_SETTLED", message }, { status });
  }
}
