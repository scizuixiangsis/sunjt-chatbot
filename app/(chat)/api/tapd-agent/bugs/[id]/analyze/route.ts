import { auth } from "@/app/(auth)/auth";
import { ChatbotError } from "@/lib/errors";
import { runBugAnalysis } from "@/lib/tapd-agent/service";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();

  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const { id } = await params;
  let modelId: string | undefined;

  try {
    const body = (await request.json()) as { modelId?: unknown };

    if (typeof body.modelId === "string") {
      modelId = body.modelId;
    }
  } catch {
    modelId = undefined;
  }

  const task = await runBugAnalysis(id, modelId);

  if (!task) {
    return Response.json({ error: "Bug task not found" }, { status: 404 });
  }

  return Response.json({ task });
}
