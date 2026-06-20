import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCollectionApplySmoke } from './collection-noise-apply.mjs';
import { runCollectionQualitySmoke } from './collection-noise-quality.mjs';
import { runCollectionSourceSmoke } from './collection-noise-source.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');

await runCollectionSourceSmoke(root);
await runCollectionQualitySmoke(root);
await runCollectionApplySmoke(root);
