import { reviewRun } from "@/server/story/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ runId: string }> }) {
  const { runId } = await context.params;
  try {
    return Response.json(reviewRun(runId));
  } catch (error) {
    const message = error instanceof Error ? error.message : "无法读取试玩局。";
    const status = message.includes("尚未结算") ? 409 : 404;
    return Response.json({ error: "RUN_REVIEW_UNAVAILABLE", message }, { status });
  }
}
