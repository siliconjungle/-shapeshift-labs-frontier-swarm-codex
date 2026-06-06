import fs from 'node:fs';
import path from 'node:path';
import { packages } from './package-readme-catalog.mjs';
import { renderRelatedPackages, replaceOrInsertHeadingSection } from './package-readme-render.mjs';

export function runPackageReadmeSections({ packageRoot, args }) {
  const check = args.includes('--check');
  const packageJson = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
  const current = packages.find((entry) => entry.name === packageJson.name);
  if (!current) throw new Error('unknown Frontier package in package.json: ' + packageJson.name);

  const readmePath = path.join(packageRoot, 'README.md');
  const currentText = fs.readFileSync(readmePath, 'utf8');
  const nextText = replaceOrInsertHeadingSection(
    currentText,
    '## Related Packages',
    renderRelatedPackages(packages, current)
  );

  if (currentText !== nextText) {
    if (check) {
      console.error('README package-family sections are stale.');
      console.error('Run npm run readme:packages to refresh README.md.');
      process.exit(1);
    }
    fs.writeFileSync(readmePath, nextText);
  }
}
