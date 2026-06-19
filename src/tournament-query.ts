import fs from 'node:fs/promises';
import path from 'node:path';
import {
  compareSwarmStrategyTournaments,
  createSwarmStrategyTournamentHistory,
  createSwarmTournamentAdaptiveFeedback,
  querySwarmStrategyTournament,
  type FrontierSwarmStrategyTournament,
  type FrontierSwarmStrategyTournamentComparison,
  type FrontierSwarmStrategyTournamentHistory,
  type FrontierSwarmTournamentAdaptiveFeedback
} from '@shapeshift-labs/frontier-swarm';
import {
  FRONTIER_SWARM_CODEX_TOURNAMENT_QUERY_KIND,
  FRONTIER_SWARM_CODEX_TOURNAMENT_QUERY_VERSION
} from './constants.js';
import { isObject, pathExists } from './common.js';
import {
  attachCodexCalibrationAdaptiveFeedback,
  createCodexCalibrationAdaptiveFeedback
} from './calibration-feedback.js';
import type { FrontierCodexCompactDashboard } from './types-evidence.js';
import type { FrontierCodexSemanticImportQuality } from './types-semantic.js';
import { summarizeCodexSemanticImportQuality } from './semantic-import-quality.js';
import { createCodexTournamentBanditView } from './tournament-bandit-view.js';

type CliValue = string | boolean | string[];
type CliArgs = Record<string, CliValue | undefined> & { _: string[] };
export type FrontierCodexTournamentView = 'summary' | 'standings' | 'matches' | 'full' | 'bandit';

export interface FrontierCodexTournamentQueryInput {
  tournament?: string;
  collection?: string;
  run?: string;
  view?: FrontierCodexTournamentView;
  limit?: number;
  strategyId?: string;
  gameId?: string;
  outcome?: string;
  tag?: string;
  payoffTag?: string;
  strategyTag?: string;
  gameTag?: string;
  minScore?: number;
  maxScore?: number;
  cwd?: string;
}

export interface FrontierCodexTournamentSemanticImportQueryRecord {
  summary?: FrontierCodexCompactDashboard['semanticImport'];
  jobs: Array<{
    jobId: string;
    lane?: string;
    disposition?: string;
    mergeScore?: number;
    changedPaths: string[];
    semanticImportQuality: FrontierCodexSemanticImportQuality;
  }>;
  sources: string[];
}

export async function queryCodexSwarmTournament(input: FrontierCodexTournamentQueryInput) {
  const tournamentPath = await resolveTournamentPath(input);
  const source = await readTournament(tournamentPath);
  const tournament = querySwarmStrategyTournament(source, {
    strategyId: input.strategyId,
    gameId: input.gameId,
    outcome: input.outcome,
    tag: input.tag,
    payoffTag: input.payoffTag,
    strategyTag: input.strategyTag,
    gameTag: input.gameTag,
    minScore: input.minScore,
    maxScore: input.maxScore
  });
  const semanticImport = await readTournamentSemanticImportQueryRecord(await resolveCollectionDir(input, tournamentPath));
  return tournamentView(tournament, tournamentPath, input.view ?? 'standings', input.limit, semanticImport);
}

export async function compareCodexSwarmTournaments(input: { baseline: string; current: string; cwd?: string; scoreThreshold?: number }) {
  const baselinePath = await resolveTournamentPath({ tournament: input.baseline, cwd: input.cwd });
  const currentPath = await resolveTournamentPath({ tournament: input.current, cwd: input.cwd });
  const comparison = withTournamentComparisonSummary(compareSwarmStrategyTournaments({
    baseline: await readTournament(baselinePath),
    current: await readTournament(currentPath),
    scoreThreshold: input.scoreThreshold
  }));
  return { baselinePath, currentPath, comparison };
}

export async function createCodexSwarmTournamentHistory(input: { tournaments: readonly string[]; cwd?: string }) {
  const tournamentPaths = await Promise.all(input.tournaments.map((entry) => resolveTournamentPath({ tournament: entry, cwd: input.cwd })));
  const history = withTournamentHistorySummary(
    createSwarmStrategyTournamentHistory({ tournaments: await Promise.all(tournamentPaths.map(readTournament)) })
  );
  return { tournamentPaths, history };
}

function withTournamentHistorySummary(history: FrontierSwarmStrategyTournamentHistory): FrontierSwarmStrategyTournamentHistory & { summary: Record<string, number> } {
  const tournaments = history.tournaments ?? [];
  return {
    ...history,
    summary: {
      tournamentCount: tournaments.length,
      candidateCount: tournaments.reduce((sum, tournament) => sum + tournament.candidates.length, 0),
      matchCount: tournaments.reduce((sum, tournament) => sum + tournament.matches.length, 0),
      standingCount: tournaments.reduce((sum, tournament) => sum + tournament.standings.length, 0)
    }
  };
}

function withTournamentComparisonSummary(
  comparison: FrontierSwarmStrategyTournamentComparison
): FrontierSwarmStrategyTournamentComparison & { summary: Record<string, number> } {
  const regression = (comparison as unknown as { regression?: unknown }).regression === true;
  return {
    ...comparison,
    summary: {
      tournamentCount: nonNegativeNumber((comparison as unknown as { tournamentCount?: unknown }).tournamentCount),
      candidateCount: nonNegativeNumber((comparison as unknown as { candidateCount?: unknown }).candidateCount),
      stableCount: regression ? 0 : 1,
      regressionCount: regression ? 1 : 0
    }
  };
}

function nonNegativeNumber(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

export async function handleCodexTournamentCommand(args: CliArgs): Promise<void> {
  const action = String(args._[1] ?? args.action ?? 'show');
  const cwd = process.cwd();
  const result = action === 'compare'
    ? await compareCommand(args, cwd)
    : action === 'history'
      ? await historyCommand(args, cwd)
      : action === 'feedback'
        ? await feedbackCommand(args, cwd)
        : await queryCodexSwarmTournament(queryInput(args, cwd));
  await writeMaybe(args, result, action);
  console.log(JSON.stringify(result, null, 2));
}

export async function readCodexTournamentAdaptiveFeedback(file: string): Promise<FrontierSwarmTournamentAdaptiveFeedback> {
  return JSON.parse(await fs.readFile(file, 'utf8')) as FrontierSwarmTournamentAdaptiveFeedback;
}

async function compareCommand(args: CliArgs, cwd: string) {
  const baseline = stringArg(args.baseline);
  const current = stringArg(args.current);
  if (!baseline || !current) throw new Error('tournament compare requires --baseline <file> --current <file>');
  return compareCodexSwarmTournaments({ baseline, current, cwd, scoreThreshold: numberArg(args.scoreThreshold ?? args['score-threshold']) });
}

async function historyCommand(args: CliArgs, cwd: string) {
  const tournaments = listArg(args.tournament).concat(listArg(args.collection).map((entry) => path.join(entry, 'strategy-tournament.json')));
  if (tournaments.length === 0 && (args.run || args.collection)) tournaments.push(await resolveTournamentPath({ run: stringArg(args.run), collection: stringArg(args.collection), cwd }));
  if (tournaments.length === 0) throw new Error('tournament history requires --tournament <file> or --collection <dir>');
  return createCodexSwarmTournamentHistory({ tournaments, cwd });
}

async function feedbackCommand(args: CliArgs, cwd: string) {
  const input = queryInput(args, cwd);
  const tournamentPath = await resolveTournamentPath(input);
  const collectionDir = await resolveCollectionDir(input, tournamentPath);
  const historyPath = stringArg(args.history);
  const comparisonPath = stringArg(args.comparison);
  const history: FrontierSwarmStrategyTournamentHistory | undefined = historyPath ? JSON.parse(await fs.readFile(path.resolve(cwd, historyPath), 'utf8')) : undefined;
  const comparison: FrontierSwarmStrategyTournamentComparison | undefined = comparisonPath ? JSON.parse(await fs.readFile(path.resolve(cwd, comparisonPath), 'utf8')) : undefined;
  const feedback = createSwarmTournamentAdaptiveFeedback({
    tournament: await readTournament(tournamentPath),
    history,
    comparison,
    scoreFloor: numberArg(args.scoreFloor ?? args['score-floor']),
    regressionThreshold: numberArg(args.regressionThreshold ?? args['regression-threshold'])
  });
  const calibrationFeedback = await createCodexCalibrationAdaptiveFeedback({
    collectionDir,
    generatedAt: feedback.generatedAt
  });
  return attachCodexCalibrationAdaptiveFeedback(feedback, calibrationFeedback);
}

function tournamentView(
  tournament: FrontierSwarmStrategyTournament,
  tournamentPath: string,
  view: FrontierCodexTournamentView,
  limit?: number,
  semanticImport?: FrontierCodexTournamentSemanticImportQueryRecord
) {
  if (view === 'bandit') return createCodexTournamentBanditView({ tournament, tournamentPath, limit, semanticImport });
  const standings = limit ? tournament.standings.slice(0, limit) : tournament.standings;
  const matches = limit ? tournament.matches.slice(0, limit) : tournament.matches;
  return {
    kind: FRONTIER_SWARM_CODEX_TOURNAMENT_QUERY_KIND,
    version: FRONTIER_SWARM_CODEX_TOURNAMENT_QUERY_VERSION,
    ok: true,
    tournamentPath,
    view,
    summary: tournament.summary,
    ...(semanticImport ? { semanticImport } : {}),
    ...(view === 'standings' || view === 'full' ? { standings } : {}),
    ...(view === 'matches' || view === 'full' ? { matches } : {}),
    ...(view === 'full' ? { tournament } : {})
  };
}

async function resolveCollectionDir(
  input: Pick<FrontierCodexTournamentQueryInput, 'collection' | 'run' | 'cwd'>,
  tournamentPath: string
): Promise<string | undefined> {
  const cwd = path.resolve(input.cwd ?? process.cwd());
  const candidates = [
    input.collection,
    input.run ? path.join(input.run, 'collected') : undefined,
    input.run ? path.join(input.run, 'collection') : undefined,
    path.dirname(tournamentPath)
  ].filter((entry): entry is string => !!entry).map((entry) => path.resolve(cwd, entry));
  for (const candidate of candidates) {
    if (await pathExists(path.join(candidate, 'compact-dashboard.json')) || await pathExists(path.join(candidate, 'coordinator-query.json'))) {
      return candidate;
    }
  }
  return undefined;
}

async function readTournamentSemanticImportQueryRecord(
  collectionDir: string | undefined
): Promise<FrontierCodexTournamentSemanticImportQueryRecord | undefined> {
  if (!collectionDir) return undefined;
  const compactPath = path.join(collectionDir, 'compact-dashboard.json');
  const dashboardPath = path.join(collectionDir, 'coordinator-query.json');
  const compact = await readJsonIfExists<FrontierCodexCompactDashboard>(compactPath);
  const dashboard = await readJsonIfExists<{ jobs?: unknown[] }>(dashboardPath);
  const expected = compact?.semanticImport.expected ?? false;
  const jobs = Array.isArray(dashboard?.jobs)
    ? dashboard.jobs.map((entry) => semanticImportJobQueryRecord(entry, expected)).filter((entry): entry is FrontierCodexTournamentSemanticImportQueryRecord['jobs'][number] => Boolean(entry))
    : compact?.topJobs.map((entry) => ({
      jobId: entry.jobId,
      ...(entry.lane ? { lane: entry.lane } : {}),
      disposition: entry.disposition,
      mergeScore: entry.mergeScore,
      changedPaths: [...entry.changedPaths],
      semanticImportQuality: entry.semanticImportQuality ?? summarizeCodexSemanticImportQuality(undefined, expected)
    })) ?? [];
  if (!compact && jobs.length === 0) return undefined;
  return {
    ...(compact ? { summary: compact.semanticImport } : {}),
    jobs,
    sources: [
      ...(compact ? [compactPath] : []),
      ...(dashboard ? [dashboardPath] : [])
    ]
  };
}

function semanticImportJobQueryRecord(
  value: unknown,
  expected: boolean
): FrontierCodexTournamentSemanticImportQueryRecord['jobs'][number] | undefined {
  if (!isObject(value) || typeof value.jobId !== 'string') return undefined;
  return {
    jobId: value.jobId,
    ...(typeof value.lane === 'string' ? { lane: value.lane } : {}),
    ...(typeof value.disposition === 'string' ? { disposition: value.disposition } : {}),
    ...(typeof value.mergeScore === 'number' ? { mergeScore: value.mergeScore } : {}),
    changedPaths: Array.isArray(value.changedPaths) ? value.changedPaths.filter((entry): entry is string => typeof entry === 'string') : [],
    semanticImportQuality: isObject(value.semanticImportQuality)
      ? value.semanticImportQuality as unknown as FrontierCodexSemanticImportQuality
      : summarizeCodexSemanticImportQuality(isObject(value.semanticImport) ? value.semanticImport as Parameters<typeof summarizeCodexSemanticImportQuality>[0] : undefined, expected)
  };
}

async function readJsonIfExists<T>(file: string): Promise<T | undefined> {
  if (!await pathExists(file)) return undefined;
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as T;
  } catch {
    return undefined;
  }
}

async function resolveTournamentPath(input: Pick<FrontierCodexTournamentQueryInput, 'tournament' | 'collection' | 'run' | 'cwd'>): Promise<string> {
  const cwd = path.resolve(input.cwd ?? process.cwd());
  const candidates = [
    input.tournament,
    input.collection ? path.join(input.collection, 'strategy-tournament.json') : undefined,
    input.run ? path.join(input.run, 'strategy-tournament.json') : undefined,
    input.run ? path.join(input.run, 'collected', 'strategy-tournament.json') : undefined,
    input.run ? path.join(input.run, 'collection', 'strategy-tournament.json') : undefined
  ].filter((entry): entry is string => !!entry).map((entry) => path.resolve(cwd, entry));
  for (const candidate of candidates) if (await pathExists(candidate)) return candidate;
  throw new Error('could not resolve strategy-tournament.json');
}

async function readTournament(file: string): Promise<FrontierSwarmStrategyTournament> {
  return JSON.parse(await fs.readFile(file, 'utf8')) as FrontierSwarmStrategyTournament;
}

function queryInput(args: CliArgs, cwd: string): FrontierCodexTournamentQueryInput {
  return {
    cwd,
    tournament: stringArg(args.tournament),
    collection: stringArg(args.collection),
    run: stringArg(args.run),
    view: viewArg(args.view),
    limit: numberArg(args.limit),
    strategyId: stringArg(args.strategy ?? args.strategyId ?? args['strategy-id']),
    gameId: stringArg(args.game ?? args.gameId ?? args['game-id']),
    outcome: stringArg(args.outcome),
    tag: stringArg(args.tag),
    payoffTag: stringArg(args.payoffTag ?? args['payoff-tag']),
    strategyTag: stringArg(args.strategyTag ?? args['strategy-tag']),
    gameTag: stringArg(args.gameTag ?? args['game-tag']),
    minScore: numberArg(args.minScore ?? args['min-score']),
    maxScore: numberArg(args.maxScore ?? args['max-score'])
  };
}

async function writeMaybe(args: CliArgs, value: unknown, action: string): Promise<void> {
  const out = stringArg(args.out ?? args.outFile ?? args['out-file']);
  const outDir = stringArg(args.outDir ?? args['out-dir']);
  if (!out && !outDir) return;
  const file = path.resolve(out ?? path.join(String(outDir), `tournament-${action}.json`));
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value, null, 2) + '\n');
}

function viewArg(value: CliValue | undefined): FrontierCodexTournamentView | undefined {
  const view = stringArg(value);
  if (!view) return undefined;
  if (view === 'summary' || view === 'standings' || view === 'matches' || view === 'full' || view === 'bandit') return view;
  throw new Error(`unsupported tournament --view ${view}`);
}

function listArg(value: CliValue | undefined): string[] {
  if (value === undefined) return [];
  return (Array.isArray(value) ? value : String(value).split(',')).map((entry) => String(entry).trim()).filter(Boolean);
}

function stringArg(value: CliValue | undefined): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function numberArg(value: CliValue | undefined): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
