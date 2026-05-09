import type {
  AgentAuditEvent,
  AgentBugTask,
  AgentTaskStatus,
  FixAttempt,
  TapdBug,
} from "./types";

type StoreState = {
  tasks: Map<string, AgentBugTask>;
};

const globalStore = globalThis as typeof globalThis & {
  tapdAgentStore?: StoreState;
};

function createInitialState(): StoreState {
  return {
    tasks: new Map(),
  };
}

function getStore() {
  if (!globalStore.tapdAgentStore) {
    globalStore.tapdAgentStore = createInitialState();
  }

  return globalStore.tapdAgentStore;
}

function createAuditEvent({
  bugId,
  action,
  actor,
  message,
}: Omit<AgentAuditEvent, "id" | "createdAt">): AgentAuditEvent {
  return {
    id: `${bugId}-${action}-${Date.now()}`,
    bugId,
    action,
    actor,
    message,
    createdAt: new Date().toISOString(),
  };
}

export function listAgentTasks() {
  return Array.from(getStore().tasks.values()).sort((left, right) =>
    right.bug.modified.localeCompare(left.bug.modified)
  );
}

export function getAgentTask(bugId: string) {
  return getStore().tasks.get(bugId) ?? null;
}

export function replaceAgentTasks(bugs: TapdBug[]) {
  const store = getStore();
  const nextTasks = new Map<string, AgentBugTask>();

  for (const bug of bugs) {
    const existingTask = store.tasks.get(bug.id);

    nextTasks.set(bug.id, {
      ...(existingTask ?? {
        agentStatus: "pending_analysis" as const,
        auditEvents: [
          createAuditEvent({
            bugId: bug.id,
            action: "sync",
            actor: "tapd",
            message: "从 TAPD 同步缺陷并进入待分析队列。",
          }),
        ],
      }),
      bug,
    });
  }

  store.tasks = nextTasks;

  return listAgentTasks();
}

export function updateAgentTask(
  bugId: string,
  updater: (task: AgentBugTask) => AgentBugTask
) {
  const store = getStore();
  const task = store.tasks.get(bugId);

  if (!task) {
    return null;
  }

  const nextTask = updater(task);
  store.tasks.set(bugId, nextTask);
  return nextTask;
}

export function appendAuditEvent({
  bugId,
  action,
  actor,
  message,
}: Omit<AgentAuditEvent, "id" | "createdAt">) {
  return updateAgentTask(bugId, (task) => ({
    ...task,
    auditEvents: [
      createAuditEvent({ bugId, action, actor, message }),
      ...task.auditEvents,
    ],
  }));
}

export function setAgentStatus(bugId: string, agentStatus: AgentTaskStatus) {
  return updateAgentTask(bugId, (task) => ({
    ...task,
    agentStatus,
  }));
}

export function setFixAttempt(bugId: string, fixAttempt: FixAttempt) {
  return updateAgentTask(bugId, (task) => ({
    ...task,
    agentStatus: "pending_approval",
    fixAttempt,
  }));
}
