import { analyzeBug, createFixAttempt } from "./repo-agent";
import {
  appendAuditEvent,
  getAgentTask,
  replaceAgentTasks,
  setAgentStatus,
  setFixAttempt,
  updateAgentTask,
} from "./store";
import { fetchTapdBugs, hasTapdCredentials, writeBackToTapd } from "./tapd-client";
import type { AgentBugTask, TapdBugFilters } from "./types";

export async function syncTapdBugs(filters: TapdBugFilters) {
  if (!hasTapdCredentials()) {
    return {
      mode: "unconfigured" as const,
      tasks: [],
    };
  }

  const bugs = await fetchTapdBugs(filters);

  return {
    mode: "tapd" as const,
    tasks: replaceAgentTasks(bugs),
  };
}

export function runBugAnalysis(bugId: string) {
  const task = getAgentTask(bugId);

  if (!task) {
    return null;
  }

  setAgentStatus(bugId, "analyzing");
  const analysis = analyzeBug(task.bug);
  const nextStatus = analysis.blockers.length > 1 ? "blocked" : "fixable";

  return updateAgentTask(bugId, (currentTask) => ({
    ...currentTask,
    agentStatus: nextStatus,
    analysis,
    auditEvents: [
      {
        id: `${bugId}-analysis-${Date.now()}`,
        bugId,
        action: "analysis",
        actor: "agent",
        message: "Agent 已完成缺陷分析并生成修复计划。",
        createdAt: new Date().toISOString(),
      },
      ...currentTask.auditEvents,
    ],
  }));
}

export function runFixPlanning(bugId: string) {
  const task = getAgentTask(bugId);

  if (!task?.analysis) {
    return null;
  }

  setAgentStatus(bugId, "fixing");
  const fixAttempt = createFixAttempt(task.bug, task.analysis);
  const updatedTask = setFixAttempt(bugId, fixAttempt);

  appendAuditEvent({
    bugId,
    action: "fix-plan",
    actor: "agent",
    message: "Agent 已生成隔离分支、疑似 diff 和验证命令计划。",
  });

  return updatedTask;
}

function buildWritebackComment(task: AgentBugTask) {
  const prLine = task.fixAttempt?.prUrl
    ? `PR：${task.fixAttempt.prUrl}`
    : "PR：待接入 Git Provider 后自动创建";

  return [
    "AI Agent 已完成修复处理：",
    `- 分析结论：${task.analysis?.summary ?? "暂无分析结论"}`,
    `- 分支：${task.fixAttempt?.branchName ?? "未生成"}`,
    `- ${prLine}`,
    "- 验证：已生成 lint/test/build 执行计划，等待隔离环境执行结果",
  ].join("\n");
}

export async function approveWriteback(bugId: string, targetStatus?: string) {
  const task = getAgentTask(bugId);

  if (!task) {
    return null;
  }

  const comment = buildWritebackComment(task);

  if (hasTapdCredentials()) {
    await writeBackToTapd({
      bugId: task.bug.id,
      comment,
      targetStatus,
      workspaceId: task.bug.workspaceId,
    });
  }

  const updatedTask = updateAgentTask(bugId, (currentTask) => ({
    ...currentTask,
    agentStatus: "written_back",
    auditEvents: [
      {
        id: `${bugId}-writeback-${Date.now()}`,
        bugId,
        action: "writeback",
        actor: "user",
        message: hasTapdCredentials()
          ? "人工确认后已回写 TAPD 评论和状态。"
          : "人工确认已记录；当前缺少 TAPD 凭证，未调用真实回写接口。",
        createdAt: new Date().toISOString(),
      },
      ...currentTask.auditEvents,
    ],
  }));

  return updatedTask;
}
