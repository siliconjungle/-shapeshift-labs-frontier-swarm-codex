import type { FrontierCodexContextBudgetOptions } from './index.js';

type CliValue = string | boolean | string[];
type CliArgs = Record<string, CliValue | undefined> & { _: string[] };

export function contextBudgetArg(args: CliArgs): boolean | FrontierCodexContextBudgetOptions {
  const enabled = boolArg(args.contextBudget ?? args['context-budget'], true);
  if (!enabled) return false;
  return {
    enabled,
    mode: modeArg(args.contextBudgetMode ?? args['context-budget-mode']),
    warnPromptBytes: numberArg(args.warnPromptBytes ?? args['warn-prompt-bytes']),
    maxPromptBytes: numberArg(args.maxPromptBytes ?? args['max-prompt-bytes']),
    warnEstimatedInputTokens: numberArg(args.warnEstimatedInputTokens ?? args['warn-estimated-input-tokens']),
    maxEstimatedInputTokens: numberArg(args.maxEstimatedInputTokens ?? args['max-estimated-input-tokens']),
    warnActualInputTokens: numberArg(args.warnActualInputTokens ?? args['warn-actual-input-tokens']),
    maxActualInputTokens: numberArg(args.maxActualInputTokens ?? args['max-actual-input-tokens']),
    maxSourceRefs: numberArg(args.maxSourceRefs ?? args['max-source-refs']),
    maxTargetRefs: numberArg(args.maxTargetRefs ?? args['max-target-refs']),
    maxWorkspaceIncludes: numberArg(args.maxWorkspaceIncludes ?? args['max-workspace-includes'])
  };
}

function modeArg(value: CliValue | undefined): FrontierCodexContextBudgetOptions['mode'] | undefined {
  if (typeof value !== 'string') return undefined;
  if (value === 'off' || value === 'warn' || value === 'fail') return value;
  throw new Error(`unsupported --context-budget-mode ${value}; expected off, warn, or fail`);
}

function numberArg(value: CliValue | undefined): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function boolArg(value: CliValue | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (value === true) return true;
  return /^(1|true|yes|on)$/i.test(String(value));
}
