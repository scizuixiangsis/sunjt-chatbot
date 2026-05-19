export type TapdBugStatus =
  | "new"
  | "in_progress"
  | "resolved"
  | "verified"
  | "closed"
  | "reopened"
  | string;

export type AgentTaskStatus =
  | "pending_analysis"
  | "analyzing"
  | "fixable"
  | "fixing"
  | "pending_verification"
  | "pending_pr"
  | "pending_approval"
  | "written_back"
  | "blocked";

export type TapdBug = {
  id: string;
  workspaceId: string;
  title: string;
  description: string;
  status: TapdBugStatus;
  priority: string;
  severity: string;
  module: string;
  currentOwner: string;
  reporter: string;
  created: string;
  modified: string;
  url?: string;
};

export type AgentAuditEvent = {
  id: string;
  bugId: string;
  action: string;
  actor: "agent" | "user" | "tapd" | "system";
  message: string;
  createdAt: string;
};

export type AnalysisEvidence = {
  filePath: string;
  snippet: string;
  context: string;
  reason: string;
  relevance: "low" | "medium" | "high";
  keywords: string[];
  startLine: number;
  endLine: number;
  contextStartLine: number;
  contextEndLine: number;
};

export type AgentAnalysis = {
  summary: string;
  confidence: "low" | "medium" | "high";
  evidence: AnalysisEvidence[];
  searchKeywords: string[];
  suspectedFiles: string[];
  reproductionPlan: string[];
  fixPlan: string[];
  blockers: string[];
};

export type CodeWorkspace = {
  root: string;
  branch: string;
  commit: string;
  isConfigured: boolean;
};

export type RuntimeStep = {
  id: string;
  name: string;
  command: string;
  status: "pending" | "passed" | "failed" | "skipped";
  output: string;
};

export type FixAttempt = {
  branchName: string;
  prUrl?: string;
  diffSummary: string;
  changedFiles: string[];
  verification: RuntimeStep[];
};

export type AgentBugTask = {
  bug: TapdBug;
  agentStatus: AgentTaskStatus;
  analysis?: AgentAnalysis;
  fixAttempt?: FixAttempt;
  auditEvents: AgentAuditEvent[];
};

export type TapdBugFilters = {
  ids?: string;
  workspaceId?: string;
  owner?: string;
  status?: string;
  page?: number;
  limit?: number;
};

export type TapdWritebackInput = {
  bugId: string;
  workspaceId: string;
  comment: string;
  targetStatus?: string;
};
