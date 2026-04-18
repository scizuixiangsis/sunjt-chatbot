import { anthropic, createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { customProvider, gateway } from "ai";
import { isTestEnvironment } from "../constants";
import {
  getAnthropicBaseURL,
  getDirectTitleModelId,
  getProviderModelId,
  hasAnthropicApiKey,
  isAnthropicModel,
  isCustomProxyModel,
  titleModel,
  usesCustomProxy,
} from "./models";

const anthropicBaseURL = getAnthropicBaseURL();

const configuredAnthropicProvider = anthropicBaseURL
  ? createAnthropic({
      baseURL: anthropicBaseURL,
      authToken: process.env.ANTHROPIC_API_KEY?.trim(),
    })
  : anthropic;

const customProxyProvider =
  anthropicBaseURL && usesCustomProxy()
    ? createOpenAICompatible({
        name: "custom-proxy",
        baseURL: anthropicBaseURL,
        headers: {
          Authorization: `Bearer ${process.env.ANTHROPIC_API_KEY?.trim()}`,
        },
      })
    : null;

export const myProvider = isTestEnvironment
  ? (() => {
      const { chatModel, titleModel } = require("./models.mock");
      return customProvider({
        languageModels: {
          "chat-model": chatModel,
          "title-model": titleModel,
        },
      });
    })()
  : null;

export function getLanguageModel(modelId: string) {
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel(modelId);
  }

  // Generic OpenAI-compatible proxy: route all supported models (Claude + Gemini)
  if (isCustomProxyModel(modelId) && customProxyProvider) {
    return customProxyProvider.chatModel(getProviderModelId(modelId));
  }

  // Anthropic SDK (direct Anthropic or qnaigc — only when NOT using custom proxy)
  if (isAnthropicModel(modelId) && hasAnthropicApiKey() && !usesCustomProxy()) {
    return configuredAnthropicProvider(getProviderModelId(modelId));
  }

  return gateway.languageModel(modelId);
}

export function getTitleModel() {
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel("title-model");
  }

  if (hasAnthropicApiKey() && !process.env.AI_GATEWAY_API_KEY) {
    const titleModelId = getDirectTitleModelId();
    if (usesCustomProxy() && customProxyProvider) {
      return customProxyProvider.chatModel(
        getProviderModelId(titleModelId)
      );
    }
    return configuredAnthropicProvider(
      getProviderModelId(titleModelId)
    );
  }

  return gateway.languageModel(titleModel.id);
}

export function getTitleModelProviderOptions() {
  if (hasAnthropicApiKey() && !process.env.AI_GATEWAY_API_KEY) {
    return undefined;
  }

  return {
    gateway: { order: titleModel.gatewayOrder },
  } as const;
}
