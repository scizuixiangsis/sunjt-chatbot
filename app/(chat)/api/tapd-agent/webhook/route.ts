import { appendAuditEvent } from "@/lib/tapd-agent/store";

type TapdWebhookPayload = {
  event?: string;
  id?: string;
  secret?: string;
};

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as TapdWebhookPayload;
  const expectedSecret = process.env.TAPD_WEBHOOK_SECRET;

  if (expectedSecret && payload.secret !== expectedSecret) {
    return Response.json({ error: "Invalid webhook secret" }, { status: 401 });
  }

  if (!payload.id) {
    return Response.json({ error: "Missing TAPD object id" }, { status: 400 });
  }

  appendAuditEvent({
    bugId: payload.id,
    action: "webhook",
    actor: "tapd",
    message: `收到 TAPD 事件：${payload.event ?? "unknown"}`,
  });

  return Response.json({ ok: true });
}
