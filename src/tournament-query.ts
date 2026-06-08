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
import { pathExists } from './common.js';

type CliValue = string | boolean | string[];
type CliArgs = Record<string, CliValue | undefined> & { _: string[] };
export type FrontierCodexTournamentView = 'summary' | 'standings' | 'matches' | 'full';

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
  return tournamentView(tournament, tournamentPath, input.view ?? 'standings', input.limit);
}

export async function compareCodexSwarmTournaments(input: { baseline: string; current: string; cwd?: string; scoreThreshold?: number }) {
  const baselinePath = await resolveTournamentPath({ tournament: input.baseline, cwd: input.cwd });
  const currentPath = await resolveTournamentPath({ tournament: input.current, cwd: input.cwd });
  const comparison = compareSwarmStrategyTournaments({
    baseline: await readTournament(baselinePath),
    current: await readTournament(currentPath),
    scoreThreshold: input.scoreThreshold
  });
  return { baselinePath, currentPath, comparison };
}

export async function createCodexSwarmTournamentHistory(input: { tournaments: readonly string[]; cwd?: string }) {
  const tournamentPaths = await Promise.all(input.tournaments.map((entry) => resolveTournamentPath({ tournament: entry, cwd: input.cwd })));
  const history = createSwarmStrategyTournamentHistory({ tournaments: await Promise.all(tournamentPaths.map(readTournament)) });
  return { tournamentPaths, history };
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
  const tournamentPath = await resolveTournamentPath(queryInput(args, cwd));
  const historyPath = stringArg(args.history);
  const comparisonPath = stringArg(args.comparison);
  const history: FrontierSwarmStrategyTournamentHistory | undefined = historyPath ? JSON.parse(await fs.readFile(path.resolve(cwd, historyPath), 'utf8')) : undefined;
  const comparison: FrontierSwarmStrategyTournamentComparison | undefined = comparisonPath ? JSON.parse(await fs.readFile(path.resolve(cwd, comparisonPath), 'utf8')) : undefined;
  return createSwarmTournamentAdaptiveFeedback({
    tournament: await readTournament(tournamentPath),
    history,
    comparison,
    scoreFloor: numberArg(args.scoreFloor ?? args['score-floor']),
    regressionThreshold: numberArg(args.regressionThreshold ?? args['regression-threshold'])
  });
}

function tournamentView(tournament: FrontierSwarmStrategyTournament, tournamentPath: string, view: FrontierCodexTournamentView, limit?: number) {
  const standings = limit ? tournament.standings.slice(0, limit) : tournament.standings;
  const matches = limit ? tournament.matches.slice(0, limit) : tournament.matches;
  return {
    kind: FRONTIER_SWARM_CODEX_TOURNAMENT_QUERY_KIND,
    version: FRONTIER_SWARM_CODEX_TOURNAMENT_QUERY_VERSION,
    ok: true,
    tournamentPath,
    view,
    summary: tournament.summary,
    ...(view === 'standings' || view === 'full' ? { standings } : {}),
    ...(view === 'matches' || view === 'full' ? { matches } : {}),
    ...(view === 'full' ? { tournament } : {})
  };
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
  if (view === 'summary' || view === 'standings' || view === 'matches' || view === 'full') return view;
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
