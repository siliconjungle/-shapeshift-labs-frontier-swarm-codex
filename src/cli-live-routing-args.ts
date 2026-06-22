import type { FrontierCodexSwarmRunOptions } from './types-run.js';
import type { CliArgs } from './cli-args.js';
import { boolArg, numberArg, optionalBoolArg, routingModeArg } from './cli-args.js';

export function liveRoutingArg(args: CliArgs): FrontierCodexSwarmRunOptions['liveRouting'] {
  const enabledValue = args.liveRouting ?? args['live-routing'];
  const routingMode = routingModeArg(args.liveRoutingMode ?? args['live-routing-mode']);
  const minSamples = numberArg(args.liveRoutingMinSamples ?? args['live-routing-min-samples'], undefined);
  const preferSuccessRate = numberArg(args.liveRoutingPreferSuccessRate ?? args['live-routing-prefer-success-rate'], undefined);
  const avoidSuccessRate = numberArg(args.liveRoutingAvoidSuccessRate ?? args['live-routing-avoid-success-rate'], undefined);
  const highCostUsd = numberArg(args.liveRoutingHighCostUsd ?? args['live-routing-high-cost-usd'], undefined);
  const writeArtifacts = optionalBoolArg(args.liveRoutingWriteArtifacts ?? args['live-routing-write-artifacts']);
  const hasOptions = routingMode !== undefined
    || minSamples !== undefined
    || preferSuccessRate !== undefined
    || avoidSuccessRate !== undefined
    || highCostUsd !== undefined
    || writeArtifacts !== undefined;
  if (enabledValue === undefined && !hasOptions) return undefined;
  const enabled = enabledValue === undefined ? undefined : boolArg(enabledValue, true);
  if (!hasOptions) return enabled;
  return {
    ...(enabled !== undefined ? { enabled } : {}),
    ...(routingMode ? { routingMode } : {}),
    ...(minSamples !== undefined ? { minSamples } : {}),
    ...(preferSuccessRate !== undefined ? { preferSuccessRate } : {}),
    ...(avoidSuccessRate !== undefined ? { avoidSuccessRate } : {}),
    ...(highCostUsd !== undefined ? { highCostUsd } : {}),
    ...(writeArtifacts !== undefined ? { writeArtifacts } : {})
  };
}
