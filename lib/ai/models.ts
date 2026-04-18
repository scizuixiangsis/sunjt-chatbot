export const DEFAULT_CHAT_MODEL = "moonshotai/kimi-k2-0905";

const anthropicApiKey = process.env.ANTHROPIC_API_KEY?.trim();
const anthropicBaseUrl = process.env.ANTHROPIC_BASE_URL?.trim();

const qnaigcAnthropicModelMap: Partial<Record<string, string>> = {
  "anthropic/claude-opus-4-6": "claude-4.6-opus",
  "anthropic/claude-sonnet-4-5": "claude-4.5-sonnet",
};

// Models supported by the generic OpenAI-compatible proxy (e.g. newapi.dzkjm.cn)
const customProxyModelSet: Set<string> = new Set([
  "anthropic/claude-opus-4-6",
  "anthropic/claude-sonnet-4-6",
  "google/gemini-3.1-pro-preview",
]);

export const titleModel = {
  id: "mistral/mistral-small",
  name: "Mistral Small",
  provider: "mistral",
  description: "Fast model for title generation",
  gatewayOrder: ["mistral"],
};

export const directTitleModel = {
  id: "anthropic/claude-3-5-haiku-latest",
  name: "Claude Haiku 3.5",
  provider: "anthropic",
  description: "Fast Claude model for title generation",
};

export type ModelCapabilities = {
  tools: boolean;
  vision: boolean;
  reasoning: boolean;
};

export type ChatModel = {
  id: string;
  name: string;
  provider: string;
  description: string;
  gatewayOrder?: string[];
  reasoningEffort?: "none" | "minimal" | "low" | "medium" | "high";
};

export const chatModels: ChatModel[] = [
  {
    id: "anthropic/claude-opus-4-6",
    name: "Claude Opus 4.6",
    provider: "anthropic",
    description: "Highest-capability Claude model",
  },
  {
    id: "anthropic/claude-sonnet-4-6",
    name: "Claude Sonnet 4.6",
    provider: "anthropic",
    description: "Fast and capable Claude model",
  },
  {
    id: "anthropic/claude-sonnet-4-5",
    name: "Claude Sonnet 4.5",
    provider: "anthropic",
    description: "Balanced Claude model with tool use",
  },
  {
    id: "anthropic/claude-3-5-haiku-latest",
    name: "Claude Haiku 3.5",
    provider: "anthropic",
    description: "Fast Claude model with tool use",
  },
  {
    id: "google/gemini-3.1-pro-preview",
    name: "Gemini 3.1 Pro Preview",
    provider: "google",
    description: "Google Gemini 3.1 Pro preview model",
  },
  {
    id: "deepseek/deepseek-v3.2",
    name: "DeepSeek V3.2",
    provider: "deepseek",
    description: "Fast and capable model with tool use",
    gatewayOrder: ["bedrock", "deepinfra"],
  },
  {
    id: "mistral/codestral",
    name: "Codestral",
    provider: "mistral",
    description: "Code-focused model with tool use",
    gatewayOrder: ["mistral"],
  },
  {
    id: "mistral/mistral-small",
    name: "Mistral Small",
    provider: "mistral",
    description: "Fast vision model with tool use",
    gatewayOrder: ["mistral"],
  },
  {
    id: "moonshotai/kimi-k2-0905",
    name: "Kimi K2 0905",
    provider: "moonshotai",
    description: "Fast model with tool use",
    gatewayOrder: ["baseten", "fireworks"],
  },
  {
    id: "moonshotai/kimi-k2.5",
    name: "Kimi K2.5",
    provider: "moonshotai",
    description: "Moonshot AI flagship model",
    gatewayOrder: ["fireworks", "bedrock"],
  },
  {
    id: "openai/gpt-oss-20b",
    name: "GPT OSS 20B",
    provider: "openai",
    description: "Compact reasoning model",
    gatewayOrder: ["groq", "bedrock"],
    reasoningEffort: "low",
  },
  {
    id: "openai/gpt-oss-120b",
    name: "GPT OSS 120B",
    provider: "openai",
    description: "Open-source 120B parameter model",
    gatewayOrder: ["fireworks", "bedrock"],
    reasoningEffort: "low",
  },
  {
    id: "xai/grok-4.1-fast-non-reasoning",
    name: "Grok 4.1 Fast",
    provider: "xai",
    description: "Fast non-reasoning model with tool use",
    gatewayOrder: ["xai"],
  },
];

const directModelCapabilities: Partial<Record<string, ModelCapabilities>> = {
  "anthropic/claude-opus-4-6": {
    tools: true,
    vision: true,
    reasoning: false,
  },
  "anthropic/claude-sonnet-4-6": {
    tools: true,
    vision: true,
    reasoning: false,
  },
  "anthropic/claude-sonnet-4-5": {
    tools: true,
    vision: true,
    reasoning: false,
  },
  "anthropic/claude-3-5-haiku-latest": {
    tools: true,
    vision: true,
    reasoning: false,
  },
  "google/gemini-3.1-pro-preview": {
    tools: true,
    vision: true,
    reasoning: false,
  },
};

export function isAnthropicModel(modelId: string) {
  return modelId.startsWith("anthropic/");
}

/** Whether we're using a generic OpenAI-compatible proxy (not qnaigc, not direct Anthropic). */
export function usesCustomProxy() {
  return Boolean(getAnthropicBaseURL()) && !usesQnaigcAnthropicCompat();
}

/** Whether this model should be routed through the custom proxy. */
export function isCustomProxyModel(modelId: string) {
  return customProxyModelSet.has(modelId) && usesCustomProxy();
}

export function getAnthropicBaseURL() {
  if (!anthropicBaseUrl) {
    return undefined;
  }

  const trimmedBaseUrl = anthropicBaseUrl.replace(/\/+$/, "");
  return trimmedBaseUrl.endsWith("/v1")
    ? trimmedBaseUrl
    : `${trimmedBaseUrl}/v1`;
}

export function usesQnaigcAnthropicCompat() {
  return getAnthropicBaseURL()?.startsWith("https://api.qnaigc.com") ?? false;
}

export function hasAnthropicApiKey() {
  if (getAnthropicBaseURL()) {
    return Boolean(anthropicApiKey);
  }

  return Boolean(anthropicApiKey?.startsWith("sk-ant-"));
}

export function getProviderModelId(modelId: string) {
  if (usesQnaigcAnthropicCompat()) {
    return (
      qnaigcAnthropicModelMap[modelId] ?? modelId.split("/").slice(1).join("/")
    );
  }

  return modelId.split("/").slice(1).join("/");
}

export function getDirectTitleModelId() {
  if (usesCustomProxy()) {
    return "anthropic/claude-sonnet-4-6";
  }

  if (usesQnaigcAnthropicCompat()) {
    return "anthropic/claude-sonnet-4-5";
  }

  return directTitleModel.id;
}

function isAnthropicModelAvailable(modelId: string) {
  if (!hasAnthropicApiKey()) {
    return false;
  }

  // Generic OpenAI-compatible proxy: only proxy-listed Anthropic models are available
  if (usesCustomProxy()) {
    return customProxyModelSet.has(modelId);
  }

  if (usesQnaigcAnthropicCompat()) {
    return modelId in qnaigcAnthropicModelMap;
  }

  return true;
}

export async function getCapabilities(): Promise<
  Record<string, ModelCapabilities>
> {
  const results = await Promise.all(
    chatModels.map(async (model) => {
      const directCapabilities = directModelCapabilities[model.id];
      if (directCapabilities) {
        return [model.id, directCapabilities];
      }

      try {
        const res = await fetch(
          `https://ai-gateway.vercel.sh/v1/models/${model.id}/endpoints`,
          { next: { revalidate: 86_400 } }
        );
        if (!res.ok) {
          return [model.id, { tools: false, vision: false, reasoning: false }];
        }

        const json = await res.json();
        const endpoints = json.data?.endpoints ?? [];
        const params = new Set(
          endpoints.flatMap(
            (e: { supported_parameters?: string[] }) =>
              e.supported_parameters ?? []
          )
        );
        const inputModalities = new Set(
          json.data?.architecture?.input_modalities ?? []
        );

        return [
          model.id,
          {
            tools: params.has("tools"),
            vision: inputModalities.has("image"),
            reasoning: params.has("reasoning"),
          },
        ];
      } catch {
        return [model.id, { tools: false, vision: false, reasoning: false }];
      }
    })
  );

  return Object.fromEntries(results);
}

export const isDemo = process.env.IS_DEMO === "1";

type GatewayModel = {
  id: string;
  name: string;
  type?: string;
  tags?: string[];
};

export type GatewayModelWithCapabilities = ChatModel & {
  capabilities: ModelCapabilities;
};

export async function getAllGatewayModels(): Promise<
  GatewayModelWithCapabilities[]
> {
  try {
    const res = await fetch("https://ai-gateway.vercel.sh/v1/models", {
      next: { revalidate: 86_400 },
    });
    if (!res.ok) {
      return [];
    }

    const json = await res.json();
    return (json.data ?? [])
      .filter((m: GatewayModel) => m.type === "language")
      .map((m: GatewayModel) => ({
        id: m.id,
        name: m.name,
        provider: m.id.split("/")[0],
        description: "",
        capabilities: {
          tools: m.tags?.includes("tool-use") ?? false,
          vision: m.tags?.includes("vision") ?? false,
          reasoning: m.tags?.includes("reasoning") ?? false,
        },
      }));
  } catch {
    return [];
  }
}

export function getActiveModels(): ChatModel[] {
  return chatModels.filter((model) => {
    // Non-Anthropic direct models (e.g. google/*) require custom proxy
    if (customProxyModelSet.has(model.id) && !isAnthropicModel(model.id)) {
      return usesCustomProxy() && hasAnthropicApiKey();
    }
    if (isAnthropicModel(model.id)) {
      return isAnthropicModelAvailable(model.id);
    }
    return true;
  });
}

export const allowedModelIds = new Set(getActiveModels().map((m) => m.id));

export const modelsByProvider = getActiveModels().reduce(
  (acc, model) => {
    if (!acc[model.provider]) {
      acc[model.provider] = [];
    }
    acc[model.provider].push(model);
    return acc;
  },
  {} as Record<string, ChatModel[]>
);
