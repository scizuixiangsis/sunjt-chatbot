import { auth } from "@/app/(auth)/auth";
import { ChatbotError } from "@/lib/errors";
import { runFixPlanning } from "@/lib/tapd-agent/service";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();

  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const { id } = await params;
  const task = runFixPlanning(id);

  if (!task) {
    return Response.json({ error: "Bug task not found or analysis missing" }, { status: 404 });
  }

  return Response.json({ task });
}
