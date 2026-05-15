import type { TapdBug, TapdBugFilters, TapdWritebackInput } from "./types";

type TapdTokenResponse = {
  status: number;
  data?: {
    access_token?: string;
    token_type?: string;
  };
  info?: string;
};

type TapdBugResponse = {
  status: number;
  data?: Array<{
    Bug?: Record<string, unknown>;
  }>;
  info?: string;
};

type TapdMutationResponse = {
  status: number;
  info?: string;
};

type TapdUserInfoResponse = {
  status: number;
  data?: {
    name?: string;
    nick?: string;
  };
  info?: string;
};

const TAPD_API_BASE = process.env.TAPD_API_BASE ?? "https://api.tapd.cn";

let cachedBearerToken: string | null = null;
let cachedCurrentUser: string | null = null;

function getString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" ? value : "";
}

function getAuthConfig() {
  const accessToken = process.env.TAPD_ACCESS_TOKEN;
  const clientId = process.env.TAPD_CLIENT_ID;
  const clientSecret = process.env.TAPD_CLIENT_SECRET;
  const apiUser = process.env.TAPD_API_USER;
  const apiPassword = process.env.TAPD_API_PASSWORD;

  return {
    accessToken,
    apiPassword,
    apiUser,
    clientId,
    clientSecret,
    hasAccessToken: Boolean(accessToken),
    hasClientCredentials: Boolean(clientId && clientSecret),
    hasBasicCredentials: Boolean(apiUser && apiPassword),
  };
}

export function hasTapdCredentials() {
  const authConfig = getAuthConfig();
  return (
    authConfig.hasAccessToken || authConfig.hasClientCredentials || authConfig.hasBasicCredentials
  );
}

async function requestTapdToken() {
  const { clientId, clientSecret } = getAuthConfig();

  if (!(clientId && clientSecret)) {
    throw new Error("缺少 TAPD_CLIENT_ID 或 TAPD_CLIENT_SECRET");
  }

  const response = await fetch(`${TAPD_API_BASE}/tokens/request_token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
  });

  const payload = (await response.json()) as TapdTokenResponse;

  if (!response.ok || payload.status !== 1 || !payload.data?.access_token) {
    throw new Error(payload.info || "TAPD access token 获取失败");
  }

  cachedBearerToken = payload.data.access_token;
  return cachedBearerToken;
}

async function createAuthHeader() {
  const authConfig = getAuthConfig();

  if (authConfig.accessToken) {
    return {
      Authorization: `Bearer ${authConfig.accessToken}`,
    };
  }

  if (authConfig.hasBasicCredentials) {
    return {
      Authorization: `Basic ${Buffer.from(`${authConfig.apiUser}:${authConfig.apiPassword}`).toString("base64")}`,
    };
  }

  const token = cachedBearerToken ?? (await requestTapdToken());
  return {
    Authorization: `Bearer ${token}`,
  };
}

async function getCurrentTapdUser() {
  if (cachedCurrentUser) {
    return cachedCurrentUser;
  }

  const response = await fetch(`${TAPD_API_BASE}/users/info`, {
    headers: await createAuthHeader(),
  });
  const payload = (await response.json()) as TapdUserInfoResponse;

  if (!response.ok || payload.status !== 1) {
    return null;
  }

  cachedCurrentUser = payload.data?.nick ?? payload.data?.name ?? null;
  return cachedCurrentUser;
}

function normalizeBug(record: Record<string, unknown>): TapdBug {
  const workspaceId = getString(record, "workspace_id") || process.env.TAPD_WORKSPACE_ID || "";
  const id = getString(record, "id");

  return {
    id,
    workspaceId,
    title: getString(record, "title"),
    description: getString(record, "description"),
    status: getString(record, "status"),
    priority: getString(record, "priority_label") || getString(record, "priority"),
    severity: getString(record, "severity"),
    module: getString(record, "module"),
    currentOwner: getString(record, "current_owner"),
    reporter: getString(record, "reporter"),
    created: getString(record, "created"),
    modified: getString(record, "modified"),
    url: `https://www.tapd.cn/tapd_fe/${workspaceId}/bug/detail/${id}`,
  };
}

export async function fetchTapdBugs(filters: TapdBugFilters) {
  const workspaceId = filters.workspaceId ?? process.env.TAPD_WORKSPACE_ID;
  const bugIds = filters.ids ?? process.env.TAPD_BUG_IDS;
  const owner = filters.owner ?? (await getCurrentTapdUser());
  const status = filters.status;

  if (!workspaceId) {
    throw new Error("缺少 TAPD_WORKSPACE_ID");
  }

  const params = new URLSearchParams({
    fields:
      "id,title,description,status,priority,priority_label,severity,module,current_owner,reporter,created,modified,workspace_id",
    limit: String(filters.limit ?? 30),
    order: "modified desc",
    page: String(filters.page ?? 1),
    workspace_id: workspaceId,
  });

  if (bugIds) {
    params.set("id", bugIds);
  }

  if (owner && owner !== "all") {
    params.set("current_owner", owner);
  }

  if (status) {
    params.set("status", status);
  }

  const response = await fetch(`${TAPD_API_BASE}/bugs?${params.toString()}`, {
    headers: await createAuthHeader(),
  });
  const payload = (await response.json()) as TapdBugResponse;

  if (!response.ok || payload.status !== 1) {
    throw new Error(payload.info || "TAPD 缺陷列表获取失败");
  }

  return (payload.data ?? [])
    .map((item) => item.Bug)
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map(normalizeBug);
}

export async function writeBackToTapd(input: TapdWritebackInput) {
  const commentResponse = await fetch(`${TAPD_API_BASE}/comments`, {
    method: "POST",
    headers: {
      ...(await createAuthHeader()),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      description: input.comment,
      entry_id: input.bugId,
      entry_type: "bug",
      workspace_id: input.workspaceId,
    }),
  });
  const commentPayload = (await commentResponse.json()) as TapdMutationResponse;

  if (!commentResponse.ok || commentPayload.status !== 1) {
    throw new Error(commentPayload.info || "TAPD 评论回写失败");
  }

  if (!input.targetStatus) {
    return commentPayload;
  }

  const statusResponse = await fetch(`${TAPD_API_BASE}/bugs/update_bug`, {
    method: "POST",
    headers: {
      ...(await createAuthHeader()),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      id: input.bugId,
      status: input.targetStatus,
      workspace_id: input.workspaceId,
    }),
  });
  const statusPayload = (await statusResponse.json()) as TapdMutationResponse;

  if (!statusResponse.ok || statusPayload.status !== 1) {
    throw new Error(statusPayload.info || "TAPD 状态更新失败");
  }

  return statusPayload;
}
