import path from 'node:path';
import {
  humanActionsFromDashboard,
  readCodexHumanActionAnswerArtifacts,
  resolveCodexHumanActions,
  type FrontierCodexResolvedHumanActions
} from './human-actions.js';
import type { FrontierCodexCollectResult } from './types-collection.js';
import type { FrontierCodexContinuationInput } from './types-continuation.js';

export interface FrontierCodexContinuationHumanActionState extends FrontierCodexResolvedHumanActions {
  answerPaths: string[];
  statePath: string;
}

export async function createContinuationHumanActionState(input: {
  continuation: FrontierCodexContinuationInput;
  cwd: string;
  outDir: string;
  collection?: FrontierCodexCollectResult;
  generatedAt: number;
}): Promise<FrontierCodexContinuationHumanActionState> {
  const answers = await readCodexHumanActionAnswerArtifacts({
    cwd: input.cwd,
    generatedAt: input.generatedAt,
    answers: input.continuation.humanAnswers,
    answerPath: input.continuation.humanAnswersPath,
    answerPaths: input.continuation.humanAnswerPaths,
    roots: [input.collection?.outDir, input.collection?.runDir]
  });
  const resolved = resolveCodexHumanActions({
    actions: humanActionsFromDashboard(input.collection?.dashboard),
    answers: answers.answers,
    generatedAt: input.generatedAt
  });
  return {
    ...resolved,
    answerPaths: answers.paths,
    statePath: path.join(input.outDir, 'human-actions.next.json')
  };
}
