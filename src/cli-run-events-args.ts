import type { FrontierCodexSwarmRunOptions } from './index.js';
import type { CliArgs, CliValue } from './cli-args.js';

export function runEventOptionsArg(args: CliArgs): Pick<FrontierCodexSwarmRunOptions, 'runEventsPath' | 'runDashboardPath'> {
  return {
    runEventsPath: pathOrFalseArg(args.runEvents ?? args['run-events']),
    runDashboardPath: pathOrFalseArg(args.runDashboard ?? args['run-dashboard'])
  };
}

export function pathOrFalseArg(value: CliValue | undefined): string | false | undefined {
  if (value === undefined) return undefined;
  if (value === true) return undefined;
  const raw = String(Array.isArray(value) ? value[value.length - 1] : value).trim();
  if (!raw) return undefined;
  if (/^(0|false|no|off|disabled)$/i.test(raw)) return false;
  return raw;
}
