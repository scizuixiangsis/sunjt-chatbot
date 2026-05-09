"use client";

import {
  BotIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  GitPullRequestIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { AgentBugTask } from "@/lib/tapd-agent/types";
import { cn } from "@/lib/utils";

type AgentListResponse = {
  mode: "tapd" | "unconfigured";
  tasks: AgentBugTask[];
};

const statusLabels: Record<string, string> = {
  analyzing: "分析中",
  blocked: "信息不足",
  fixable: "可修复",
  fixing: "修复中",
  pending_analysis: "待分析",
  pending_approval: "待确认",
  pending_pr: "待提交 PR",
  pending_verification: "待验证",
  written_back: "已回写",
};

async function postAction(url: string, body?: Record<string, string>) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    throw new Error("Agent action failed");
  }

  return (await response.json()) as { task: AgentBugTask };
}

export function BugAgentConsole() {
  const [mode, setMode] = useState<"tapd" | "unconfigured">("unconfigured");
  const [allTasks, setAllTasks] = useState<AgentBugTask[]>([]);
  const [selectedBugId, setSelectedBugId] = useState("");
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [runningAction, setRunningAction] = useState<string | null>(null);

  const tapdStatusOptions = useMemo(() => {
    const statusSet = new Set(
      allTasks.map((task) => task.bug.status).filter(Boolean)
    );

    return Array.from(statusSet)
      .sort((left, right) => left.localeCompare(right))
      .map((status) => ({
        label: status,
        value: status,
      }));
  }, [allTasks]);
  const allTapdStatusValues = useMemo(
    () => tapdStatusOptions.map((option) => option.value),
    [tapdStatusOptions]
  );
  const isAllStatusSelected = selectedStatuses.length === 0;
  const tasks = useMemo(() => {
    if (isAllStatusSelected) {
      return allTasks;
    }

    return allTasks.filter((task) =>
      selectedStatuses.includes(task.bug.status)
    );
  }, [allTasks, isAllStatusSelected, selectedStatuses]);

  const selectedTask = useMemo(() => {
    return tasks.find((task) => task.bug.id === selectedBugId) ?? tasks.at(0);
  }, [selectedBugId, tasks]);

  const loadTasks = useCallback(async () => {
    setIsLoading(true);

    try {
      const response = await fetch("/api/tapd-agent/bugs");

      if (!response.ok) {
        throw new Error("Load TAPD bugs failed");
      }

      const data = (await response.json()) as AgentListResponse;
      setMode(data.mode);
      setAllTasks(data.tasks);

      const firstTask = data.tasks.at(0);

      if (!selectedBugId && firstTask) {
        setSelectedBugId(firstTask.bug.id);
      }
    } catch (_error) {
      toast.error("缺陷列表加载失败");
    } finally {
      setIsLoading(false);
    }
  }, [selectedBugId]);

  useEffect(() => {
    loadTasks().catch(() => undefined);
  }, [loadTasks]);

  const updateTask = (task: AgentBugTask) => {
    setAllTasks((currentTasks) =>
      currentTasks.map((currentTask) => {
        if (currentTask.bug.id === task.bug.id) {
          return task;
        }

        return currentTask;
      })
    );
    setSelectedBugId(task.bug.id);
  };

  const runAction = async (
    action: "analyze" | "fix" | "approve",
    successMessage: string
  ) => {
    if (!selectedTask) {
      return;
    }

    setRunningAction(action);

    try {
      const body =
        action === "approve" ? { targetStatus: "resolved" } : undefined;
      const data = await postAction(
        `/api/tapd-agent/bugs/${selectedTask.bug.id}/${action}`,
        body
      );
      updateTask(data.task);
      toast.success(successMessage);
    } catch (_error) {
      toast.error("操作失败，请查看服务端日志");
    } finally {
      setRunningAction(null);
    }
  };

  const toggleStatus = (status: string) => {
    setSelectedStatuses((currentStatuses) => {
      if (currentStatuses.length === 0) {
        return allTapdStatusValues.filter(
          (currentStatus) => currentStatus !== status
        );
      }

      if (currentStatuses.includes(status)) {
        return currentStatuses.filter(
          (currentStatus) => currentStatus !== status
        );
      }

      return [...currentStatuses, status];
    });
  };

  const renderEmpty = () => (
    <div className="flex h-full items-center justify-center rounded-3xl border border-dashed bg-muted/20 p-10 text-muted-foreground text-sm">
      暂无缺陷数据，请先配置 TAPD_ACCESS_TOKEN 后同步。
    </div>
  );

  const renderTaskList = () => (
    <div className="space-y-3">
      {tasks.map((task) => (
        <button
          className={cn(
            "w-full rounded-2xl border bg-card p-4 text-left transition-colors hover:bg-muted/30",
            selectedTask?.bug.id === task.bug.id && "border-primary bg-muted/40"
          )}
          key={task.bug.id}
          onClick={() => setSelectedBugId(task.bug.id)}
          type="button"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="line-clamp-2 font-medium text-sm">
                {task.bug.title}
              </p>
              <p className="mt-1 text-muted-foreground text-xs">
                #{task.bug.id} · {task.bug.module || "未标注模块"}
              </p>
            </div>
            <Badge variant="outline">
              {statusLabels[task.agentStatus] ?? task.agentStatus}
            </Badge>
          </div>
        </button>
      ))}
    </div>
  );

  const renderAnalysis = () => {
    if (!selectedTask?.analysis) {
      return (
        <p className="text-muted-foreground text-sm">
          点击“开始分析”后，Agent 会生成问题理解、疑似文件、复现计划和修复计划。
        </p>
      );
    }

    return (
      <div className="space-y-4">
        <p className="text-sm">{selectedTask.analysis.summary}</p>
        <InfoList
          items={selectedTask.analysis.suspectedFiles}
          title="疑似文件"
        />
        <InfoList
          items={selectedTask.analysis.reproductionPlan}
          title="复现计划"
        />
        <InfoList items={selectedTask.analysis.fixPlan} title="修复计划" />
        {selectedTask.analysis.blockers.length > 0 && (
          <InfoList items={selectedTask.analysis.blockers} title="阻塞信息" />
        )}
      </div>
    );
  };

  const renderFixAttempt = () => {
    if (!selectedTask?.fixAttempt) {
      return (
        <p className="text-muted-foreground text-sm">
          点击“生成修复计划”后，Agent 会创建分支名、diff 摘要和验证命令计划。
        </p>
      );
    }

    return (
      <div className="space-y-4">
        <div className="rounded-2xl bg-muted/30 p-4">
          <p className="text-muted-foreground text-xs">分支</p>
          <p className="font-mono text-sm">
            {selectedTask.fixAttempt.branchName}
          </p>
        </div>
        <p className="text-sm">{selectedTask.fixAttempt.diffSummary}</p>
        <InfoList
          items={selectedTask.fixAttempt.changedFiles}
          title="计划修改文件"
        />
        <div className="space-y-2">
          <p className="font-medium text-sm">验证命令</p>
          {selectedTask.fixAttempt.verification.map((step) => (
            <div
              className="rounded-xl border bg-background p-3 text-sm"
              key={step.id}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono">{step.command}</span>
                <Badge variant="secondary">{step.status}</Badge>
              </div>
              <p className="mt-2 text-muted-foreground text-xs">
                {step.output}
              </p>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderAudit = () => {
    if (!selectedTask) {
      return null;
    }

    return (
      <div className="space-y-3">
        {selectedTask.auditEvents.map((event) => (
          <div
            className="rounded-xl border bg-background p-3 text-sm"
            key={event.id}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium">{event.action}</span>
              <span className="text-muted-foreground text-xs">
                {event.createdAt}
              </span>
            </div>
            <p className="mt-2 text-muted-foreground">{event.message}</p>
          </div>
        ))}
      </div>
    );
  };

  return (
    <main className="min-h-dvh bg-background p-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section className="rounded-3xl border bg-card p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <BotIcon className="size-5 text-primary" />
                <h1 className="font-semibold text-2xl">TAPD Bug 修复 Agent</h1>
              </div>
              <p className="mt-2 text-muted-foreground text-sm">
                从 TAPD
                同步缺陷，生成分析、修复计划、验证计划，并在人工确认后回写。
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={mode === "tapd" ? "default" : "outline"}>
                {mode === "tapd" ? "TAPD API" : "未配置"}
              </Badge>
              <StatusFilter
                isAllSelected={isAllStatusSelected}
                onSelectAll={() => setSelectedStatuses([])}
                onToggle={toggleStatus}
                options={tapdStatusOptions}
                selectedStatuses={selectedStatuses}
              />
              <Button disabled={isLoading} onClick={loadTasks} type="button">
                <RefreshCwIcon className="size-4" />
                同步缺陷
              </Button>
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[380px_1fr]">
          <aside className="rounded-3xl border bg-card p-4">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-medium">缺陷队列</h2>
              <Badge variant="secondary">{tasks.length}</Badge>
            </div>
            {tasks.length > 0 ? renderTaskList() : renderEmpty()}
          </aside>

          <div className="space-y-6">
            {selectedTask && (
              <>
                <section className="rounded-3xl border bg-card p-6">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">
                          {selectedTask.bug.status}
                        </Badge>
                        <Badge variant="secondary">
                          {selectedTask.bug.priority}
                        </Badge>
                        <Badge variant="secondary">
                          {selectedTask.bug.severity}
                        </Badge>
                      </div>
                      <h2 className="mt-3 font-semibold text-xl">
                        {selectedTask.bug.title}
                      </h2>
                      <p className="mt-2 text-muted-foreground text-sm">
                        负责人：{selectedTask.bug.currentOwner || "未分配"} ·
                        创建人：
                        {selectedTask.bug.reporter || "未知"}
                      </p>
                    </div>
                    {selectedTask.bug.url && (
                      <Button asChild variant="outline">
                        <a
                          href={selectedTask.bug.url}
                          rel="noopener"
                          target="_blank"
                        >
                          打开 TAPD
                        </a>
                      </Button>
                    )}
                  </div>
                </section>

                <section className="grid gap-6 xl:grid-cols-2">
                  <Panel
                    action={
                      <Button
                        disabled={Boolean(runningAction)}
                        onClick={() => runAction("analyze", "分析完成")}
                        type="button"
                      >
                        <ShieldCheckIcon className="size-4" />
                        开始分析
                      </Button>
                    }
                    title="AI 分析"
                  >
                    {renderAnalysis()}
                  </Panel>
                  <Panel
                    action={
                      <Button
                        disabled={
                          Boolean(runningAction) || !selectedTask.analysis
                        }
                        onClick={() => runAction("fix", "修复计划已生成")}
                        type="button"
                      >
                        <GitPullRequestIcon className="size-4" />
                        生成修复计划
                      </Button>
                    }
                    title="修复与验证"
                  >
                    {renderFixAttempt()}
                  </Panel>
                </section>

                <section className="grid gap-6 xl:grid-cols-[1fr_360px]">
                  <Panel
                    action={
                      <Button
                        disabled={
                          Boolean(runningAction) || !selectedTask.fixAttempt
                        }
                        onClick={() => runAction("approve", "已完成回写确认")}
                        type="button"
                      >
                        <CheckCircle2Icon className="size-4" />
                        确认回写 TAPD
                      </Button>
                    }
                    title="人工审批"
                  >
                    <p className="text-muted-foreground text-sm">
                      状态变更和 TAPD 评论必须由用户点击确认。未配置 TAPD
                      凭证时，系统只记录审批日志，不会调用真实接口。
                    </p>
                  </Panel>
                  <Panel title="审计日志">{renderAudit()}</Panel>
                </section>
              </>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function StatusFilter({
  isAllSelected,
  onSelectAll,
  onToggle,
  options,
  selectedStatuses,
}: {
  isAllSelected: boolean;
  onSelectAll: () => void;
  onToggle: (status: string) => void;
  options: Array<{
    label: string;
    value: string;
  }>;
  selectedStatuses: string[];
}) {
  const triggerText = isAllSelected
    ? "全部状态"
    : `已选 ${selectedStatuses.length} 个状态`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline">
          {triggerText}
          <ChevronDownIcon className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>状态过滤</DropdownMenuLabel>
        <DropdownMenuItem onClick={onSelectAll}>全选</DropdownMenuItem>
        <DropdownMenuSeparator />
        {options.map((option) => (
          <DropdownMenuCheckboxItem
            checked={isAllSelected || selectedStatuses.includes(option.value)}
            key={option.value}
            onCheckedChange={() => onToggle(option.value)}
            onSelect={(event) => event.preventDefault()}
          >
            {option.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Panel({
  action,
  children,
  title,
}: {
  action?: ReactNode;
  children: ReactNode;
  title: string;
}) {
  return (
    <section className="rounded-3xl border bg-card p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="font-medium">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function InfoList({ items, title }: { items: string[]; title: string }) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <p className="font-medium text-sm">{title}</p>
      <ul className="space-y-2">
        {items.map((item) => (
          <li
            className="rounded-xl border bg-background px-3 py-2 text-sm"
            key={item}
          >
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
