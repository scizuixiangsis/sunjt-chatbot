import type { RuntimeStep } from "./types";

const allowedVerificationCommands = [
  "pnpm check",
  "pnpm test",
  "pnpm build",
] as const;

export function createVerificationPlan() {
  return allowedVerificationCommands.map((command) => ({
    id: command.replaceAll(" ", "-"),
    name: command,
    command,
    status: "pending",
    output: "等待人工确认后在隔离工作区执行。",
  })) satisfies RuntimeStep[];
}

export function markVerificationAsPlanned(steps: RuntimeStep[]) {
  return steps.map((step) => ({
    ...step,
    status: "skipped" as const,
    output:
      "当前 MVP 仅生成安全执行计划，真实命令需要在独立 worktree 或容器中运行。",
  }));
}

export function createBranchName(bugId: string) {
  return `fix/tapd-${bugId}`;
}
