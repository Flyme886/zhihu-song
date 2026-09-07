import { listPacks } from "@/server/story/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 四个可玩故事包的公开目录；不返回任何隐藏条件或结算规则。 */
export function GET() {
  return Response.json({ packs: listPacks() }, { headers: { "Cache-Control": "no-store" } });
}
