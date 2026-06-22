import type { FrontierCodexSwarmRunOptions } from './index.js';
import type { CliArgs, CliValue } from './cli-args.js';
import { normalizeCodexRunSyncDirection } from './run-sync.js';
import type { FrontierCodexDistributedRunTransportKind } from './types-distributed-run.js';

export function runEventOptionsArg(args: CliArgs): Pick<FrontierCodexSwarmRunOptions, 'runEventsPath' | 'runDashboardPath'> {
  return {
    runEventsPath: pathOrFalseArg(args.runEvents ?? args['run-events']),
    runDashboardPath: pathOrFalseArg(args.runDashboard ?? args['run-dashboard'])
  };
}

export function runSyncOptionsArg(args: CliArgs): Pick<FrontierCodexSwarmRunOptions, 'runSyncPeers' | 'runSyncDirection' | 'runSyncEvidencePath' | 'runSyncHistoryPath'> {
  return {
    runSyncPeers: listValueArg(args.runSyncPeer ?? args['run-sync-peer'] ?? args.syncPeer ?? args['sync-peer']),
    runSyncDirection: normalizeCodexRunSyncDirection(stringValueArg(args.runSyncDirection ?? args['run-sync-direction'] ?? args.syncDirection ?? args['sync-direction'])),
    runSyncEvidencePath: pathOrFalseArg(args.runSyncEvidence ?? args['run-sync-evidence']),
    runSyncHistoryPath: pathOrFalseArg(args.runSyncHistory ?? args['run-sync-history'])
  };
}

export function distributedRunOptionsArg(args: CliArgs): Pick<FrontierCodexSwarmRunOptions, 'distributedRun'> {
  const explicitEnabled = args.distributed ?? args['distributed-run'];
  const runRoot = stringValueArg(args.distributedRunRoot ?? args['distributed-run-root'] ?? args.frontierRunRoot ?? args['frontier-run-root']);
  const peers = listValueArg(args.distributedRunPeer ?? args['distributed-run-peer'] ?? args.distributedPeer ?? args['distributed-peer']);
  const transport = stringValueArg(args.distributedRunTransport ?? args['distributed-run-transport'] ?? args.distributedTransport ?? args['distributed-transport']);
  const syncDirection = normalizeCodexRunSyncDirection(stringValueArg(args.distributedRunSyncDirection ?? args['distributed-run-sync-direction']));
  const proofPath = pathOrFalseArg(args.distributedRunProof ?? args['distributed-run-proof']);
  const hasDistributedOptions = Boolean(runRoot || peers?.length || transport || syncDirection || proofPath !== undefined);
  if (explicitEnabled === undefined && !hasDistributedOptions) return {};
  return {
    distributedRun: {
      enabled: explicitEnabled === undefined ? true : boolValueArg(explicitEnabled),
      ...(runRoot ? { runRoot } : {}),
      ...(peers?.length ? { peers } : {}),
      ...(transport ? { transport: transport as FrontierCodexDistributedRunTransportKind } : {}),
      ...(syncDirection ? { syncDirection } : {}),
      ...(proofPath !== undefined ? { proofPath } : {})
    }
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

function listValueArg(value: CliValue | undefined): string[] | undefined {
  if (value === undefined) return undefined;
  const raw = Array.isArray(value) ? value : String(value).split(',');
  const out = raw.map((item) => String(item).trim()).filter(Boolean);
  return out.length ? out : undefined;
}

function stringValueArg(value: CliValue | undefined): string | undefined {
  if (value === undefined || value === true) return undefined;
  const raw = String(Array.isArray(value) ? value[value.length - 1] : value).trim();
  return raw || undefined;
}

function boolValueArg(value: CliValue): boolean {
  if (value === true) return true;
  return /^(1|true|yes|on)$/i.test(String(Array.isArray(value) ? value[value.length - 1] : value));
}
