export function renderRelatedPackages(packages, currentPackage) {
  const related = packages.filter((entry) => entry.id !== currentPackage.id);
  const tick = String.fromCharCode(96);
  return [
    'The published Frontier package family is generated from one shared package catalog so READMEs stay in sync across packages:',
    '',
    ...related.map((entry) => '- [' + tick + entry.name + tick + '](' + entry.npmUrl + '): ' + entry.role),
    '',
    'Package source repositories:',
    '',
    ...packages.map((entry) => '- [' + tick + entry.repoName + tick + '](' + entry.repoUrl + ')')
  ].join('\n') + '\n';
}

export function replaceOrInsertHeadingSection(text, heading, body) {
  const normalizedBody = body.replace(/\n*$/, '\n\n');
  const start = text.indexOf(heading + '\n');
  if (start !== -1) {
    const bodyStart = start + heading.length + 1;
    const next = findNextHeading(text, bodyStart);
    if (next === -1) return text.slice(0, bodyStart) + '\n' + normalizedBody;
    return text.slice(0, bodyStart) + '\n' + normalizedBody + text.slice(next);
  }
  const insertAt = findNextHeading(text, text.indexOf('\n') + 1);
  if (insertAt === -1) return text.replace(/\n*$/, '\n\n') + heading + '\n\n' + normalizedBody;
  return text.slice(0, insertAt) + '\n' + heading + '\n\n' + normalizedBody + text.slice(insertAt);
}

function findNextHeading(text, fromIndex) {
  const headingPattern = /^## .+$/gm;
  headingPattern.lastIndex = fromIndex;
  const match = headingPattern.exec(text);
  return match ? match.index : -1;
}
