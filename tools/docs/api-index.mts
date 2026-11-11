/**
 * Writes the API reference's index page after TypeDoc: the intro from `api-readme.md`, then one list of
 * package names per package area, in the order and grouping `packageAreas.ts` gives the package
 * directory, so the index, its sidebar and the Packages page sort packages the same way. The index
 * holds names only: the Packages page is where each package is described.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadProject } from './project.mts';
import { groupPackages } from './site/.vitepress/theme/packageAreas.ts';

const packageDirectory = path.dirname(fileURLToPath(import.meta.url));
const intro = readFileSync(path.join(packageDirectory, 'api-readme.md'), 'utf8').trim();

const { packages } = loadProject();
const sections = groupPackages(packages).map((area) => {
    const links = area.packages.map((pkg) => `- [${pkg.name.slice(pkg.name.indexOf('/') + 1)}](${pkg.name}/index.md)`);
    return [`## ${area.title}`, '', area.description, '', ...links].join('\n');
});

const scope = packages[0]?.name.split('/')[0] ?? '';
writeFileSync(
    path.join(packageDirectory, 'site', 'api', 'index.md'),
    `${intro}\n\nEvery package is published under the \`${scope}\` scope.\n\n${sections.join('\n\n')}\n`
);
