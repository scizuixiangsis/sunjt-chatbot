import { anthropic, createAnthropic } from "@ai-sdk/anthropic";
import { customProvider, gateway } from "ai";
import { isTestEnvironment } from "../constants";
import {
  getAnthropicBaseURL,
  getDirectTitleModelId,
  getProviderModelId,
  hasAnthropicApiKey,
  isAnthropicModel,
  titleModel,
} from "./models";

const anthropicBaseURL = getAnthropicBaseURL();

const configuredAnthropicProvider = anthropicBaseURL
  ? createAnthropic({
      baseURL: anthropicBaseURL,
      authToken: process.env.ANTHROPIC_API_KEY?.trim(),
    })
  : anthropic;

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

  if (isAnthropicModel(modelId) && hasAnthropicApiKey()) {
    return configuredAnthropicProvider(getProviderModelId(modelId));
  }

  return gateway.languageModel(modelId);
}

export function getTitleModel() {
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel("title-model");
  }

  if (hasAnthropicApiKey() && !process.env.AI_GATEWAY_API_KEY) {
    return configuredAnthropicProvider(
      getProviderModelId(getDirectTitleModelId())
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
