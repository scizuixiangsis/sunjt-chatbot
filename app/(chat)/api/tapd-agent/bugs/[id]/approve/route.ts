import { auth } from "@/app/(auth)/auth";
import { ChatbotError } from "@/lib/errors";
import { approveWriteback } from "@/lib/tapd-agent/service";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();

  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const body = (await request.json().catch(() => ({}))) as {
    targetStatus?: string;
  };
  const { id } = await params;
  const task = await approveWriteback(id, body.targetStatus);

  if (!task) {
    return Response.json({ error: "Bug task not found" }, { status: 404 });
  }

  return Response.json({ task });
}
