import { createBranchName, createVerificationPlan, markVerificationAsPlanned } from "./runtime";
import type { AgentAnalysis, FixAttempt, TapdBug } from "./types";

const moduleFileHints: Record<string, string[]> = {
  Chat: [
    "app/(chat)/page.tsx",
    "components/chat/multimodal-input.tsx",
    "components/chat/messages.tsx",
  ],
  "Model Selector": [
    "components/ai-elements/model-selector.tsx",
    "lib/ai/models.ts",
    "app/(chat)/api/models/route.ts",
  ],
};

function inferSuspectedFiles(bug: TapdBug) {
  const moduleHints = moduleFileHints[bug.module];

  if (moduleHints) {
    return moduleHints;
  }

  return ["app/(chat)/page.tsx", "components/chat/app-sidebar.tsx", "lib/utils.ts"];
}

function inferBlockers(bug: TapdBug) {
  const blockers: string[] = [];

  if (!bug.description) {
    blockers.push("缺少复现步骤或问题描述，需要补充上下文。");
  }

  if (!bug.module) {
    blockers.push("缺少模块信息，代码定位置信度会降低。");
  }

  return blockers;
}

export function analyzeBug(bug: TapdBug): AgentAnalysis {
  const blockers = inferBlockers(bug);
  const suspectedFiles = inferSuspectedFiles(bug);

  return {
    summary: `该缺陷属于 ${bug.module || "未标注模块"}，当前状态为 ${bug.status || "未知"}。Agent 将优先从标题、描述和模块映射定位前端组件，再补充浏览器复现。`,
    confidence: blockers.length > 0 ? "medium" : "high",
    suspectedFiles,
    reproductionPlan: [
      "打开对应业务页面并切换到缺陷描述中的场景。",
      "按 TAPD 复现步骤操作，保留截图和控制台错误。",
      "修复后重复同一路径，确认页面状态、交互和异常提示符合预期。",
    ],
    fixPlan: [
      `创建 ${createBranchName(bug.id)} 分支或独立 worktree。`,
      "优先修改疑似文件中的最小代码路径。",
      "执行 lint、类型检查、单测或 E2E，并把结果写入审计日志。",
      "生成 PR 后等待人工确认，再回写 TAPD 评论和状态。",
    ],
    blockers,
  };
}

export function createFixAttempt(bug: TapdBug, analysis: AgentAnalysis): FixAttempt {
  const branchName = createBranchName(bug.id);
  const verification = markVerificationAsPlanned(createVerificationPlan());

  return {
    branchName,
    changedFiles: analysis.suspectedFiles,
    diffSummary:
      "MVP 已生成修复执行计划。接入真实代码修改器后，将在隔离工作区产出 patch 并创建 PR。",
    prUrl: process.env.GIT_PROVIDER_PR_EXAMPLE_URL,
    verification,
  };
}
