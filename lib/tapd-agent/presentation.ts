const agentStatusLabels: Record<string, string> = {
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

const tapdBugStatusLabels: Record<string, string> = {
  closed: "已关闭",
  in_progress: "处理中",
  new: "新建",
  reopened: "重新打开",
  resolved: "已解决",
  verified: "已验证",
};

const tapdPriorityLabels: Record<string, string> = {
  high: "高",
  low: "低",
  medium: "中",
  normal: "普通",
  urgent: "紧急",
};

const tapdSeverityLabels: Record<string, string> = {
  critical: "致命",
  fatal: "致命",
  major: "严重",
  minor: "轻微",
  normal: "一般",
  serious: "严重",
  trivial: "提示",
};

function getLabel(value: string, labels: Record<string, string>) {
  return labels[value.trim().toLowerCase()] ?? value;
}

export function formatAgentStatus(status: string) {
  return getLabel(status, agentStatusLabels);
}

export function formatTapdBugStatus(status: string) {
  return getLabel(status, tapdBugStatusLabels);
}

export function formatTapdPriority(priority: string) {
  return getLabel(priority, tapdPriorityLabels);
}

export function formatTapdSeverity(severity: string) {
  return getLabel(severity, tapdSeverityLabels);
}