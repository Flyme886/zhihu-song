import { packById } from "@/server/story/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ packId: string }> }) {
  const { packId } = await context.params;
  const definition = packById(packId);
  if (!definition) {
    return Response.json({ error: "STORY_PACK_NOT_FOUND", message: "当前故事包不存在。" }, { status: 404 });
  }
  return Response.json(definition.publicPack, {
    headers: { "Cache-Control": "no-store" },
  });
}
