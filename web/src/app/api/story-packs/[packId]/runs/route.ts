import { startRun } from "@/server/story/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: Request, context: { params: Promise<{ packId: string }> }) {
  const { packId } = await context.params;
  try {
    return Response.json(startRun(packId));
  } catch (error) {
    return Response.json(
      { error: "STORY_PACK_NOT_FOUND", message: error instanceof Error ? error.message : "无法开始试玩局。" },
      { status: 404 },
    );
  }
}
