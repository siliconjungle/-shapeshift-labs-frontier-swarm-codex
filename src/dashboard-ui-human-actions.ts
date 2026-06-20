import { stableHash, uniqueStrings, isObject } from './common.js';
import {
  booleanValue,
  stringArrayValue,
  stringValue,
  timestampValue
} from './dashboard-ui-values.js';
import type {
  FrontierCodexDashboardHumanAction,
  FrontierCodexDashboardHumanActionPriority,
  FrontierCodexDashboardHumanActionType
} from './types-dashboard.js';

export function createDashboardHumanActions(dashboard: unknown): FrontierCodexDashboardHumanAction[] {
  const rows = [
    ...dashboardPersistedHumanActions(dashboard),
    ...dashboardHumanActionsFromBoardSources(dashboard)
  ];
  const deduped = new Map<string, FrontierCodexDashboardHumanAction>();
  for (const row of rows) {
    if (!isOpenDashboardHumanAction(row)) continue;
    if (!deduped.has(row.code)) deduped.set(row.code, row);
  }
  return Array.from(deduped.values())
    .sort((left, right) => dashboardHumanActionPriorityRank(left.priority) - dashboardHumanActionPriorityRank(right.priority)
      || (left.createdAt ?? 0) - (right.createdAt ?? 0)
      || left.code.localeCompare(right.code))
    .slice(0, 60);
}

function dashboardPersistedHumanActions(value: unknown): FrontierCodexDashboardHumanAction[] {
  const dashboard = isObject(value) ? value : {};
  const metadata = isObject(dashboard.metadata) ? dashboard.metadata : {};
  return [...humanActionRecordArray(dashboard.humanActions), ...humanActionRecordArray(metadata.humanActions)]
    .map((entry) => normalizeDashboardHumanAction(entry))
    .filter((entry): entry is FrontierCodexDashboardHumanAction => Boolean(entry));
}

function dashboardHumanActionsFromBoardSources(value: unknown): FrontierCodexDashboardHumanAction[] {
  const dashboard = isObject(value) ? value : {};
  const metadata = isObject(dashboard.metadata) ? dashboard.metadata : {};
  const boards = [dashboard.board, metadata.board, metadata.humanActionBoard, dashboard.humanActionBoard];
  const rows: FrontierCodexDashboardHumanAction[] = [];
  for (const board of boards) {
    if (!isObject(board) || !Array.isArray(board.entries)) continue;
    for (const entry of board.entries) {
      if (!isHumanFacingBoardEntry(entry)) continue;
      const action = dashboardHumanActionFromBoardEntry(entry);
      if (action) rows.push(action);
    }
  }
  return rows;
}

function normalizeDashboardHumanAction(value: unknown): FrontierCodexDashboardHumanAction | undefined {
  if (!isObject(value)) return undefined;
  const id = stringValue(value.id) ?? 'dashboard-human-action:' + stableHash(value);
  const type = dashboardHumanActionType(stringValue(value.type), stringValue(value.kind));
  const priority = dashboardHumanActionPriority(stringValue(value.priority), stringValue(value.riskLevel), stringValue(value.status), stringValue(value.kind));
  const code = stringValue(value.code) ?? dashboardHumanActionCode(dashboardHumanActionPrefix(type, priority), id);
  const title = stringValue(value.title) ?? stringValue(value.topic) ?? id;
  const question = stringValue(value.question) ?? stringValue(value.prompt) ?? stringValue(value.detail) ?? stringValue(value.text) ?? title;
  const detail = stringValue(value.detail) ?? stringValue(value.context) ?? question;
  return {
    id,
    code,
    status: stringValue(value.status) ?? 'open',
    priority,
    type,
    title,
    question,
    scope: stringValue(value.scope) ?? stringValue(value.lane) ?? stringValue(value.topic) ?? 'workspace',
    detail,
    ...(stringValue(value.why) ?? stringValue(value.reason) ? { why: stringValue(value.why) ?? stringValue(value.reason) } : {}),
    ...(stringValue(value.requestedAnswer) ?? stringValue(value.answerFormat) ?? stringValue(value.expectedAnswer) ? { requestedAnswer: stringValue(value.requestedAnswer) ?? stringValue(value.answerFormat) ?? stringValue(value.expectedAnswer) } : {}),
    defaultAction: stringValue(value.defaultAction) ?? 'Answer in Codex so the coordinator can resolve the item.',
    ...(stringValue(value.askedBy) ?? stringValue(value.agentId) ?? stringValue(value.jobId) ? { askedBy: stringValue(value.askedBy) ?? stringValue(value.agentId) ?? stringValue(value.jobId) } : {}),
    source: stringValue(value.source) ?? 'board',
    ...(stringValue(value.jobId) ? { jobId: stringValue(value.jobId) } : {}),
    ...(stringValue(value.taskId) ? { taskId: stringValue(value.taskId) } : {}),
    ...(stringValue(value.lane) ? { lane: stringValue(value.lane) } : {}),
    options: dashboardHumanActionOptions(value.options),
    ...(timestampValue(value.createdAt ?? value.generatedAt) ? { createdAt: timestampValue(value.createdAt ?? value.generatedAt) } : {}),
    ...(timestampValue(value.answeredAt) ? { answeredAt: timestampValue(value.answeredAt) } : {}),
    ...(timestampValue(value.resolvedAt) ? { resolvedAt: timestampValue(value.resolvedAt) } : {}),
    ...(stringValue(value.answer) ? { answer: stringValue(value.answer) } : {}),
    ...(stringValue(value.resolution) ? { resolution: stringValue(value.resolution) } : {}),
    evidencePaths: stringArrayValue(value.evidencePaths),
    changedPaths: stringArrayValue(value.changedPaths)
  };
}

function dashboardHumanActionFromBoardEntry(value: unknown): FrontierCodexDashboardHumanAction | undefined {
  if (!isObject(value)) return undefined;
  const metadata = isObject(value.metadata) ? value.metadata : {};
  const id = stringValue(value.id) ?? 'dashboard-board-action:' + stableHash(value);
  const kind = stringValue(value.kind);
  const status = stringValue(value.status) ?? 'open';
  const type = dashboardHumanActionType(stringValue(metadata.type), kind);
  const priority = dashboardHumanActionPriority(stringValue(metadata.priority), stringValue(value.riskLevel), status, kind);
  const title = stringValue(value.title) ?? stringValue(value.topic) ?? id;
  const question = stringValue(metadata.question) ?? stringValue(value.question) ?? stringValue(value.text) ?? title;
  const detail = stringValue(metadata.detail) ?? stringValue(value.detail) ?? stringValue(value.text) ?? question;
  return {
    id,
    code: stringValue(metadata.code ?? value.code) ?? dashboardHumanActionCode(dashboardHumanActionPrefix(type, priority), id),
    status,
    priority,
    type,
    title,
    question,
    scope: stringValue(metadata.scope) ?? stringValue(value.lane) ?? stringValue(value.groupId) ?? stringValue(value.topic) ?? 'workspace',
    detail,
    ...(stringValue(metadata.why) ?? stringValue(value.why) ?? stringValue(value.reason) ? { why: stringValue(metadata.why) ?? stringValue(value.why) ?? stringValue(value.reason) } : {}),
    ...(stringValue(metadata.requestedAnswer) ?? stringValue(metadata.answerFormat) ?? stringValue(value.requestedAnswer) ?? stringValue(value.answerFormat) ? { requestedAnswer: stringValue(metadata.requestedAnswer) ?? stringValue(metadata.answerFormat) ?? stringValue(value.requestedAnswer) ?? stringValue(value.answerFormat) } : {}),
    defaultAction: stringValue(metadata.defaultAction) ?? defaultHumanActionForType(type),
    ...(stringValue(metadata.askedBy) ?? stringValue(value.agentId) ?? stringValue(value.jobId) ? { askedBy: stringValue(metadata.askedBy) ?? stringValue(value.agentId) ?? stringValue(value.jobId) } : {}),
    source: 'board',
    ...(stringValue(value.jobId) ? { jobId: stringValue(value.jobId) } : {}),
    ...(stringValue(value.taskId) ? { taskId: stringValue(value.taskId) } : {}),
    ...(stringValue(value.lane) ? { lane: stringValue(value.lane) } : {}),
    options: dashboardHumanActionOptions(metadata.options ?? value.options),
    ...(timestampValue(value.generatedAt) ? { createdAt: timestampValue(value.generatedAt) } : {}),
    ...(timestampValue(metadata.answeredAt) ? { answeredAt: timestampValue(metadata.answeredAt) } : {}),
    ...(timestampValue(metadata.resolvedAt) ? { resolvedAt: timestampValue(metadata.resolvedAt) } : {}),
    ...(stringValue(metadata.answer) ? { answer: stringValue(metadata.answer) } : {}),
    ...(stringValue(metadata.resolution) ? { resolution: stringValue(metadata.resolution) } : {}),
    evidencePaths: evidencePathsFromBoardEntry(value.evidenceRefs),
    changedPaths: stringArrayValue(value.changedPaths)
  };
}

function humanActionRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isObject) : [];
}

function isHumanFacingBoardEntry(value: unknown): boolean {
  if (!isObject(value)) return false;
  const metadata = isObject(value.metadata) ? value.metadata : {};
  const kind = stringValue(value.kind)?.toLowerCase();
  const target = (stringValue(metadata.target) ?? stringValue(value.target) ?? stringValue(metadata.audience) ?? stringValue(value.audience))?.toLowerCase();
  if (target === 'human' || target === 'user' || target === 'operator') return true;
  if (booleanValue(metadata.requiresHuman) || booleanValue(value.requiresHuman) || booleanValue(metadata.askHuman) || booleanValue(value.askHuman)) return true;
  if (kind === 'human-question' || kind === 'ask-human' || kind === 'human-decision' || kind === 'user-question' || kind === 'operator-question') return true;
  return (kind === 'decision' || kind === 'review-question' || kind === 'escalation') && Boolean(stringValue(metadata.question) ?? stringValue(value.question));
}

function dashboardHumanActionOptions(value: unknown): FrontierCodexDashboardHumanAction['options'] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry === 'string') return [{ label: entry }];
    if (!isObject(entry)) return [];
    const label = stringValue(entry.label) ?? stringValue(entry.title) ?? stringValue(entry.value);
    if (!label) return [];
    const detail = stringValue(entry.detail) ?? stringValue(entry.description) ?? stringValue(entry.impact);
    return [{ label, ...(detail ? { detail } : {}) }];
  }).slice(0, 6);
}

function evidencePathsFromBoardEntry(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return uniqueStrings(value.map((entry) => {
    if (typeof entry === 'string') return entry;
    if (isObject(entry)) return stringValue(entry.path) ?? stringValue(entry.href) ?? stringValue(entry.id) ?? '';
    return '';
  }).filter(Boolean));
}

function dashboardHumanActionType(value: string | undefined, kind: string | undefined): FrontierCodexDashboardHumanActionType {
  if (value === 'question' || value === 'concern' || value === 'review' || value === 'approval') return value;
  if (kind === 'human-question' || kind === 'ask-human' || kind === 'review-question' || kind === 'decision') return 'question';
  if (kind === 'ownership' || kind === 'escalation') return 'approval';
  return 'concern';
}

function dashboardHumanActionPriority(value: string | undefined, riskLevel: string | undefined, status: string | undefined, kind: string | undefined): FrontierCodexDashboardHumanActionPriority {
  if (value === 'blocking' || value === 'important' || value === 'info') return value;
  if (riskLevel === 'high' || status === 'blocked' || kind === 'blocker' || kind === 'ownership') return 'blocking';
  if (status === 'needs-review' || kind === 'review-question' || kind === 'escalation') return 'important';
  return 'info';
}

function dashboardHumanActionPrefix(type: FrontierCodexDashboardHumanActionType, priority: FrontierCodexDashboardHumanActionPriority): string {
  if (priority === 'blocking') return type === 'approval' ? 'R' : 'B';
  if (type === 'approval') return 'R';
  if (type === 'question' || type === 'review') return 'Q';
  return 'I';
}

function dashboardHumanActionCode(prefix: string, ...parts: unknown[]): string {
  const hash = stableHash(parts).split(':').pop() ?? stableHash(parts);
  return `${prefix}-${hash.toUpperCase().slice(0, 4)}`;
}

function defaultHumanActionForType(type: FrontierCodexDashboardHumanActionType): string {
  if (type === 'approval') return 'Answer with approve, reject, or rerun guidance in Codex.';
  if (type === 'question' || type === 'review') return 'Answer the question in Codex using the short code.';
  return 'Tell Codex whether this concern should block or be ignored.';
}

function isOpenDashboardHumanAction(action: FrontierCodexDashboardHumanAction): boolean {
  const status = action.status.toLowerCase();
  if (['answered', 'resolved', 'dismissed', 'cancelled', 'canceled', 'closed'].includes(status)) return false;
  return !action.answer && !action.resolution && action.answeredAt === undefined && action.resolvedAt === undefined;
}

function dashboardHumanActionPriorityRank(priority: FrontierCodexDashboardHumanActionPriority): number {
  if (priority === 'blocking') return 0;
  if (priority === 'important') return 1;
  return 2;
}
