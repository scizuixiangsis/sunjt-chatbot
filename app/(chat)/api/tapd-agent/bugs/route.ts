import type { NextRequest } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { ChatbotError } from "@/lib/errors";
import { syncTapdBugs } from "@/lib/tapd-agent/service";

export async function GET(request: NextRequest) {
  const session = await auth();

  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const { searchParams } = request.nextUrl;
  const page = Number.parseInt(searchParams.get("page") || "1", 10);
  const limit = Number.parseInt(searchParams.get("limit") || "30", 10);
  const result = await syncTapdBugs({
    ids: searchParams.get("ids") ?? undefined,
    limit,
    page,
    owner: searchParams.get("owner") ?? undefined,
    status: searchParams.get("status") ?? undefined,
    workspaceId: searchParams.get("workspaceId") ?? undefined,
  });

  return Response.json(result);
}
