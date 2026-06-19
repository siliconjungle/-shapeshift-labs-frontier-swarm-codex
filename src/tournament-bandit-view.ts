import * as swarm from '@shapeshift-labs/frontier-swarm';
import type { FrontierSwarmStrategyTournament } from '@shapeshift-labs/frontier-swarm';
import {
  FRONTIER_SWARM_CODEX_TOURNAMENT_QUERY_KIND,
  FRONTIER_SWARM_CODEX_TOURNAMENT_QUERY_VERSION
} from './constants.js';
import type { FrontierCodexTournamentSemanticImportQueryRecord } from './tournament-query.js';

type BanditFactory = (input: { tournament: FrontierSwarmStrategyTournament }) => {
  recommendations?: unknown[];
  summary?: Record<string, unknown>;
  [key: string]: unknown;
};

export function createCodexTournamentBanditView(input: {
  tournament: FrontierSwarmStrategyTournament;
  tournamentPath: string;
  limit?: number;
  semanticImport?: FrontierCodexTournamentSemanticImportQueryRecord;
}) {
  const createBandit = (swarm as unknown as { createSwarmContextualBanditRecommendations?: BanditFactory })
    .createSwarmContextualBanditRecommendations;
  const bandit = createBandit
    ? createBandit({ tournament: input.tournament })
    : createFallbackBanditRecommendations(input.tournament);
  const recommendations = Array.isArray(bandit.recommendations) && input.limit
    ? bandit.recommendations.slice(0, input.limit)
    : bandit.recommendations;
  const limitedBandit = {
    ...bandit,
    ...(Array.isArray(recommendations) ? { recommendations } : {}),
    summary: {
      ...(bandit.summary ?? {}),
      ...(Array.isArray(recommendations) ? { shownRecommendationCount: recommendations.length } : {})
    }
  };
  return {
    kind: FRONTIER_SWARM_CODEX_TOURNAMENT_QUERY_KIND,
    version: FRONTIER_SWARM_CODEX_TOURNAMENT_QUERY_VERSION,
    ok: true,
    tournamentPath: input.tournamentPath,
    view: 'bandit',
    summary: input.tournament.summary,
    ...(input.semanticImport ? { semanticImport: input.semanticImport } : {}),
    bandit: limitedBandit
  };
}

function createFallbackBanditRecommendations(tournament: FrontierSwarmStrategyTournament) {
  const ranked = [...tournament.standings].sort((a, b) => a.rank - b.rank || b.score - a.score);
  const recommendations = ranked.map((standing) => ({
    strategyId: standing.strategyId,
    score: standing.score,
    rank: standing.rank,
    samples: standing.samples,
    confidence: tournament.summary.sampleConfidence,
    reason: 'fallback-from-tournament-standings'
  }));
  return {
    kind: 'frontier.swarm.contextual-bandit-recommendations',
    version: 1,
    recommendations,
    summary: {
      recommendationCount: recommendations.length,
      source: 'fallback-from-tournament-standings'
    }
  };
}
