import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { generateText, Output } from "ai";
import { z } from "zod";
import { allowedModelIds, DEFAULT_CHAT_MODEL } from "@/lib/ai/models";
import { getLanguageModel } from "@/lib/ai/providers";
import { createBranchName, createVerificationPlan, markVerificationAsPlanned } from "./runtime";
import type { AgentAnalysis, AnalysisEvidence, CodeWorkspace, FixAttempt, TapdBug } from "./types";

const execFileAsync = promisify(execFile);

const ENGLISH_TOKEN_PATTERN = /[A-Za-z][A-Za-z0-9_-]{1,}/g;
const ROUTE_PATTERN = /\/[A-Za-z0-9/_-]+/g;
const RG_MATCH_PATTERN = /^(.+?):(\d+):(\d+):(.*)$/;
const TEXT_SEPARATOR_PATTERN = /[\s【】[\]（）()：:，,。.;；、\\-]+/;
const TOKEN_SEPARATOR_PATTERN = /[-_]+/;
const FUNCTION_DECL_PATTERN = /^\s*(export\s+)?(async\s+)?(function|class)\s+\w+/;
const CONST_COMPONENT_PATTERN =
  /^\s*(export\s+)?const\s+\w+\s*=\s*(async\s*)?(\(|memo\(|forwardRef\()/;

const MAX_SEARCH_KEYWORDS = 14;
const MAX_RIPGREP_MATCHES_PER_KEYWORD = 20;
const MAX_EVIDENCE_ITEMS = 6;
const MAX_FILE_CHARACTERS = 160_000;
const MAX_CONTEXT_LINES = 120;
const CONTEXT_LOOKBACK_LINES = 80;
const CONTEXT_RADIUS_LINES = 28;
const SNIPPET_RADIUS_LINES = 3;

const allowedFileExtensions = new Set([
  ".css",
  ".js",
  ".jsx",
  ".json",
  ".less",
  ".md",
  ".mdx",
  ".mjs",
  ".scss",
  ".ts",
  ".tsx",
]);

const ignoredPathSegments = new Set([
  ".git",
  ".next",
  "coverage",
  "dist",
  "node_modules",
  "playwright-report",
]);

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

const chineseKeywordMappings = [
  {
    keywords: ["reset", "Reset"],
    source: "重置",
  },
  {
    keywords: ["filter", "Filter"],
    source: "筛选",
  },
  {
    keywords: ["refresh", "Refresh", "reload", "refetch"],
    source: "刷新",
  },
  {
    keywords: ["submit", "Submit"],
    source: "提交",
  },
  {
    keywords: ["search", "Search"],
    source: "搜索",
  },
  {
    keywords: ["channel", "Channel", "channel-management", "ChannelManagement"],
    source: "频道管理",
  },
  {
    keywords: ["channel", "Channel"],
    source: "频道",
  },
  {
    keywords: ["talent", "Talent", "kol", "influencer", "marketing", "Marketing"],
    source: "达人营销",
  },
  {
    keywords: ["owner", "assignee", "user"],
    source: "负责人",
  },
  {
    keywords: ["status", "Status"],
    source: "状态",
  },
] as const;

type SearchMatch = {
  column: number;
  filePath: string;
  keyword: string;
  line: number;
  lineText: string;
};

type EvidenceCandidate = {
  filePath: string;
  keywords: string[];
  line: number;
  lineText: string;
};

const modelAnalysisSchema = z.object({
  blockers: z.array(z.string()).max(5),
  confidence: z.enum(["low", "medium", "high"]),
  evidenceReasoning: z
    .array(
      z.object({
        filePath: z.string(),
        reason: z.string(),
        relevance: z.enum(["low", "medium", "high"]),
      })
    )
    .max(MAX_EVIDENCE_ITEMS),
  fixPlan: z.array(z.string()).max(5),
  reproductionPlan: z.array(z.string()).max(5),
  summary: z.string(),
  suspectedFiles: z.array(z.string()).max(8),
});

function getRepoRoot() {
  return resolve(process.env.TAPD_AGENT_REPO_ROOT?.trim() || process.cwd());
}

async function getGitValue(args: string[]) {
  try {
    const { stdout } = await execFileAsync("git", args, {
      cwd: getRepoRoot(),
      maxBuffer: 200_000,
    });
    return stdout.trim();
  } catch {
    return "";
  }
}

export async function getCodeWorkspace(): Promise<CodeWorkspace> {
  const root = getRepoRoot();
  const [branch, commit] = await Promise.all([
    getGitValue(["rev-parse", "--abbrev-ref", "HEAD"]),
    getGitValue(["rev-parse", "--short", "HEAD"]),
  ]);

  return {
    branch,
    commit,
    isConfigured: Boolean(process.env.TAPD_AGENT_REPO_ROOT?.trim()),
    root,
  };
}

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

export function getTapdAgentModelId(requestedModelId?: string) {
  const normalizedRequestedModelId = requestedModelId?.trim();

  if (normalizedRequestedModelId && allowedModelIds.has(normalizedRequestedModelId)) {
    return normalizedRequestedModelId;
  }

  const configuredModelId = process.env.TAPD_AGENT_MODEL?.trim();

  if (configuredModelId && allowedModelIds.has(configuredModelId)) {
    return configuredModelId;
  }

  if (allowedModelIds.has(DEFAULT_CHAT_MODEL)) {
    return DEFAULT_CHAT_MODEL;
  }

  return Array.from(allowedModelIds)[0] ?? DEFAULT_CHAT_MODEL;
}

function addKeyword(keywordMap: Map<string, string>, keyword: string) {
  const normalizedKeyword = keyword.trim();

  if (normalizedKeyword.length < 2) {
    return;
  }

  const key = normalizedKeyword.toLocaleLowerCase();

  if (!keywordMap.has(key)) {
    keywordMap.set(key, normalizedKeyword);
  }
}

function toPascalCase(token: string) {
  return token
    .split(TOKEN_SEPARATOR_PATTERN)
    .filter(Boolean)
    .map((part) => {
      const firstCharacter = part.at(0);
      return firstCharacter ? `${firstCharacter.toUpperCase()}${part.slice(1)}` : "";
    })
    .join("");
}

function extractSearchKeywords(bug: TapdBug) {
  const keywordMap = new Map<string, string>();
  const sourceText = [bug.title, bug.description, bug.module].filter(Boolean).join("\n");
  const englishTokens = sourceText.match(ENGLISH_TOKEN_PATTERN) ?? [];
  const routeTokens = sourceText.match(ROUTE_PATTERN) ?? [];

  for (const token of englishTokens) {
    addKeyword(keywordMap, token);
    addKeyword(keywordMap, toPascalCase(token));
  }

  for (const token of routeTokens) {
    addKeyword(keywordMap, token);
    addKeyword(keywordMap, token.split("/").filter(Boolean).join("-"));
  }

  for (const mapping of chineseKeywordMappings) {
    if (sourceText.includes(mapping.source)) {
      for (const keyword of mapping.keywords) {
        addKeyword(keywordMap, keyword);
      }
      addKeyword(keywordMap, mapping.source);
    }
  }

  const chineseTextSegments = sourceText
    .split(TEXT_SEPARATOR_PATTERN)
    .filter((segment) => segment.length >= 2 && segment.length <= 18);

  for (const segment of chineseTextSegments.slice(0, 8)) {
    addKeyword(keywordMap, segment);
  }

  for (const fileHint of inferSuspectedFiles(bug)) {
    const fileName = fileHint.split("/").at(-1) ?? "";
    const baseName = fileName.split(".").at(0) ?? "";
    addKeyword(keywordMap, baseName);
  }

  return Array.from(keywordMap.values()).slice(0, MAX_SEARCH_KEYWORDS);
}

function getExitCode(error: unknown) {
  if (typeof error === "object" && error !== null && "code" in error) {
    return (error as { code?: unknown }).code;
  }

  return undefined;
}

function parseRipgrepOutput(output: string, keyword: string) {
  return output
    .split("\n")
    .filter(Boolean)
    .map((line): SearchMatch | null => {
      const match = RG_MATCH_PATTERN.exec(line);

      if (!match) {
        return null;
      }

      const [, filePath, lineNumber, column, lineText] = match;

      if (!(filePath && lineNumber && column && lineText !== undefined)) {
        return null;
      }

      return {
        column: Number(column),
        filePath,
        keyword,
        line: Number(lineNumber),
        lineText,
      };
    })
    .filter((match): match is SearchMatch => Boolean(match));
}

async function searchCode(keyword: string) {
  const args = [
    "--line-number",
    "--column",
    "--no-heading",
    "--color",
    "never",
    "--smart-case",
    "--fixed-strings",
    "--glob",
    "!node_modules/**",
    "--glob",
    "!.next/**",
    "--glob",
    "!dist/**",
    "--glob",
    "!coverage/**",
    "--glob",
    "!pnpm-lock.yaml",
    "--glob",
    "!*.map",
    "--",
    keyword,
    ".",
  ];

  try {
    const { stdout } = await execFileAsync("rg", args, {
      cwd: getRepoRoot(),
      maxBuffer: 1_024_000,
    });
    return parseRipgrepOutput(stdout, keyword).slice(0, MAX_RIPGREP_MATCHES_PER_KEYWORD);
  } catch (error) {
    if (getExitCode(error) === 1) {
      return [];
    }

    throw error;
  }
}

function isPathInsideRepo(filePath: string) {
  const repoRoot = getRepoRoot();
  const resolvedPath = resolve(repoRoot, filePath);
  const relativePath = relative(repoRoot, resolvedPath);

  return Boolean(relativePath) && !relativePath.startsWith("..") && !isAbsolute(relativePath);
}

function isAllowedSourceFile(filePath: string) {
  const segments = filePath.split("/");

  if (segments.some((segment) => ignoredPathSegments.has(segment))) {
    return false;
  }

  return allowedFileExtensions.has(extname(filePath).toLocaleLowerCase());
}

function createEvidenceCandidates(matches: SearchMatch[]) {
  const candidateMap = new Map<string, EvidenceCandidate>();

  for (const match of matches) {
    if (!(isAllowedSourceFile(match.filePath) && isPathInsideRepo(match.filePath))) {
      continue;
    }

    const key = `${match.filePath}:${match.line}`;
    const existingCandidate = candidateMap.get(key);

    if (existingCandidate) {
      candidateMap.set(key, {
        ...existingCandidate,
        keywords: Array.from(new Set([...existingCandidate.keywords, match.keyword])),
      });
      continue;
    }

    candidateMap.set(key, {
      filePath: match.filePath,
      keywords: [match.keyword],
      line: match.line,
      lineText: match.lineText,
    });
  }

  return Array.from(candidateMap.values())
    .sort((left, right) => right.keywords.length - left.keywords.length)
    .slice(0, MAX_EVIDENCE_ITEMS);
}

async function readSafeFile(filePath: string) {
  if (!(isAllowedSourceFile(filePath) && isPathInsideRepo(filePath))) {
    return null;
  }

  const content = await readFile(resolve(getRepoRoot(), filePath), "utf8");
  return content.slice(0, MAX_FILE_CHARACTERS);
}

function countCharacter(line: string, targetCharacter: string) {
  let count = 0;

  for (const character of line) {
    if (character === targetCharacter) {
      count += 1;
    }
  }

  return count;
}

function findContextStart(lines: string[], lineIndex: number) {
  const minIndex = Math.max(0, lineIndex - CONTEXT_LOOKBACK_LINES);
  let index = lineIndex;

  while (index >= minIndex) {
    const line = lines.at(index) ?? "";

    if (FUNCTION_DECL_PATTERN.test(line) || CONST_COMPONENT_PATTERN.test(line)) {
      return index;
    }

    index -= 1;
  }

  return Math.max(0, lineIndex - CONTEXT_RADIUS_LINES);
}

function findContextEnd(lines: string[], startIndex: number) {
  let balance = 0;
  let hasOpeningBrace = false;
  const maxIndex = Math.min(lines.length - 1, startIndex + MAX_CONTEXT_LINES - 1);
  let index = startIndex;

  while (index <= maxIndex) {
    const line = lines.at(index) ?? "";
    const openingBraceCount = countCharacter(line, "{");
    const closingBraceCount = countCharacter(line, "}");

    if (openingBraceCount > 0) {
      hasOpeningBrace = true;
    }

    balance += openingBraceCount - closingBraceCount;

    if (hasOpeningBrace && balance <= 0 && index > startIndex) {
      return index;
    }

    index += 1;
  }

  return maxIndex;
}

function formatLineRange(lines: string[], startIndex: number, endIndex: number) {
  return lines
    .slice(startIndex, endIndex + 1)
    .map((line, index) => `${startIndex + index + 1}|${line}`)
    .join("\n");
}

async function buildEvidence(candidate: EvidenceCandidate): Promise<AnalysisEvidence | null> {
  const content = await readSafeFile(candidate.filePath);

  if (!content) {
    return null;
  }

  const lines = content.split("\n");
  const lineIndex = Math.min(Math.max(candidate.line - 1, 0), lines.length - 1);
  const snippetStartIndex = Math.max(0, lineIndex - SNIPPET_RADIUS_LINES);
  const snippetEndIndex = Math.min(lines.length - 1, lineIndex + SNIPPET_RADIUS_LINES);
  const contextStartIndex = findContextStart(lines, lineIndex);
  const contextEndIndex = findContextEnd(lines, contextStartIndex);

  return {
    context: formatLineRange(lines, contextStartIndex, contextEndIndex),
    contextEndLine: contextEndIndex + 1,
    contextStartLine: contextStartIndex + 1,
    endLine: snippetEndIndex + 1,
    filePath: candidate.filePath,
    keywords: candidate.keywords,
    reason: `匹配关键词：${candidate.keywords.join("、")}`,
    relevance: candidate.keywords.length > 1 ? "high" : "medium",
    snippet: formatLineRange(lines, snippetStartIndex, snippetEndIndex),
    startLine: snippetStartIndex + 1,
  };
}

async function collectEvidence(searchKeywords: string[]) {
  const searchResults = await Promise.all(searchKeywords.map((keyword) => searchCode(keyword)));
  const candidates = createEvidenceCandidates(searchResults.flat());
  const evidenceResults = await Promise.all(
    candidates.map((candidate) => buildEvidence(candidate))
  );

  return evidenceResults.filter((evidence): evidence is AnalysisEvidence => evidence !== null);
}

function createFallbackAnalysis({
  bug,
  evidence,
  modelFailed,
  searchKeywords,
}: {
  bug: TapdBug;
  evidence: AnalysisEvidence[];
  modelFailed: boolean;
  searchKeywords: string[];
}): AgentAnalysis {
  const blockers = inferBlockers(bug);

  if (evidence.length === 0) {
    blockers.push("未通过关键词搜索命中相关代码，需要补充模块映射或更明确的复现信息。");
  }

  if (modelFailed) {
    blockers.push("模型分析调用失败，当前仅返回基于代码搜索证据的初步分析。");
  }

  const suspectedFiles =
    evidence.length > 0 ? evidence.map((item) => item.filePath) : inferSuspectedFiles(bug);

  return {
    blockers,
    confidence: evidence.length > 0 && !modelFailed ? "medium" : "low",
    evidence,
    fixPlan: [
      `创建 ${createBranchName(bug.id)} 分支或独立 worktree。`,
      "优先围绕搜索命中的文件和函数级上下文定位状态更新、请求刷新或交互回调。",
      "补充复现后再生成 unified diff，避免只凭标题直接改代码。",
    ],
    reproductionPlan: [
      "打开对应业务页面并切换到缺陷描述中的场景。",
      "按 TAPD 复现步骤操作，保留截图和控制台错误。",
      "对照搜索命中的组件或函数，确认交互事件、状态更新和请求刷新链路。",
    ],
    searchKeywords,
    summary: `已基于 ${searchKeywords.length} 个关键词在当前代码库中搜索该缺陷，命中 ${evidence.length} 个候选证据。`,
    suspectedFiles,
  };
}

function buildPrompt({
  bug,
  evidence,
  searchKeywords,
}: {
  bug: TapdBug;
  evidence: AnalysisEvidence[];
  searchKeywords: string[];
}) {
  const evidenceText = evidence
    .map(
      (item) => `文件：${item.filePath}
命中关键词：${item.keywords.join("、")}
上下文：
${item.context}`
    )
    .join("\n\n---\n\n");

  return `请基于 TAPD 缺陷信息和代码证据输出结构化分析。

缺陷信息：
- ID：${bug.id}
- 标题：${bug.title}
- 模块：${bug.module || "未标注"}
- 状态：${bug.status || "未知"}
- 优先级：${bug.priority || "未知"}
- 严重程度：${bug.severity || "未知"}
- 描述：${bug.description || "无"}

搜索关键词：
${searchKeywords.join("、")}

代码证据：
${evidenceText || "暂无代码证据"}

要求：
1. 不要臆造不存在的文件或代码。
2. suspectedFiles 必须优先来自代码证据中的文件。
3. fixPlan 只写修复方向，不要生成 diff。
4. blockers 用于说明缺失信息、证据不足或需要人工确认的点。`;
}

function enrichEvidence(
  evidence: AnalysisEvidence[],
  evidenceReasoning: Array<{
    filePath: string;
    reason: string;
    relevance: "low" | "medium" | "high";
  }>
) {
  return evidence.map((item) => {
    const reasoning = evidenceReasoning.find((reason) => reason.filePath === item.filePath);

    if (!reasoning) {
      return item;
    }

    return {
      ...item,
      reason: reasoning.reason,
      relevance: reasoning.relevance,
    };
  });
}

async function generateModelAnalysis({
  bug,
  evidence,
  modelId,
  searchKeywords,
}: {
  bug: TapdBug;
  evidence: AnalysisEvidence[];
  modelId: string;
  searchKeywords: string[];
}) {
  const { output } = await generateText({
    maxOutputTokens: 1800,
    model: getLanguageModel(modelId),
    output: Output.object({ schema: modelAnalysisSchema }),
    prompt: buildPrompt({ bug, evidence, searchKeywords }),
    system:
      "你是一个资深前端 Bug 分析 Agent。你需要根据缺陷信息和真实代码证据判断可能原因、复现路径和修复方向。输出必须准确、克制，不能编造未提供的代码细节。",
    temperature: 0.2,
  });

  return output;
}

function mergeBlockers(bug: TapdBug, modelBlockers: string[]) {
  return Array.from(new Set([...inferBlockers(bug), ...modelBlockers]));
}

export async function analyzeBug(
  bug: TapdBug,
  options?: { modelId?: string }
): Promise<AgentAnalysis> {
  const modelId = getTapdAgentModelId(options?.modelId);
  const searchKeywords = extractSearchKeywords(bug);  //关键词提取
  const evidence = await collectEvidence(searchKeywords);

  try {
    const modelAnalysis = await generateModelAnalysis({
      bug,
      evidence,
      modelId,
      searchKeywords,
    });
    const enrichedEvidence = enrichEvidence(evidence, modelAnalysis.evidenceReasoning);

    return {
      blockers: mergeBlockers(bug, modelAnalysis.blockers),
      confidence: modelAnalysis.confidence,
      evidence: enrichedEvidence,
      fixPlan: modelAnalysis.fixPlan,
      reproductionPlan: modelAnalysis.reproductionPlan,
      searchKeywords,
      summary: modelAnalysis.summary,
      suspectedFiles:
        modelAnalysis.suspectedFiles.length > 0
          ? modelAnalysis.suspectedFiles
          : enrichedEvidence.map((item) => item.filePath),
    };
  } catch {
    return createFallbackAnalysis({
      bug,
      evidence,
      modelFailed: true,
      searchKeywords,
    });
  }
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
