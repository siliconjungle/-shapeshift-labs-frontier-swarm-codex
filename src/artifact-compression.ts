import { spawn } from 'node:child_process';
import { gzip } from 'node:zlib';
import { promisify } from 'node:util';

const gzipAsync = promisify(gzip);
let zstdUsable: boolean | undefined;

export interface FrontierCodexCompressedArtifact {
  bytes: Buffer;
  compression: 'zstd' | 'gzip' | 'none';
  extension: string;
}

export async function compressArtifactBytes(
  bytes: Buffer,
  options: { enabled: boolean; compressible: boolean }
): Promise<FrontierCodexCompressedArtifact> {
  if (!options.enabled || !options.compressible) {
    return { bytes, compression: 'none', extension: '' };
  }
  const zstd = await zstdCompress(bytes).catch(() => undefined);
  if (zstd) return { bytes: zstd, compression: 'zstd', extension: '.zst' };
  return { bytes: await gzipAsync(bytes), compression: 'gzip', extension: '.gz' };
}

async function zstdCompress(bytes: Buffer): Promise<Buffer | undefined> {
  if (zstdUsable === false) return undefined;
  return new Promise((resolve, reject) => {
    const child = spawn('zstd', ['-q', '-T0', '-19', '-c'], { stdio: ['pipe', 'pipe', 'ignore'] });
    const chunks: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    child.on('error', (error) => {
      zstdUsable = false;
      reject(error);
    });
    child.on('close', (status) => {
      if (status === 0) {
        zstdUsable = true;
        resolve(Buffer.concat(chunks));
      } else {
        if (zstdUsable === undefined) zstdUsable = false;
        resolve(undefined);
      }
    });
    child.stdin.end(bytes);
  });
}
