/**
 * Writes the API reference's index page after TypeDoc: the intro from `api-readme.md`, then one table
 * per package area, in the order and grouping `packageAreas.ts` gives the package directory, so the
 * index, its sidebar and the Packages page sort packages the same way.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadProject } from './project.mts';
import { groupPackages } from './site/.vitepress/theme/packageAreas.ts';

const packageDirectory = path.dirname(fileURLToPath(import.meta.url));
const intro = readFileSync(path.join(packageDirectory, 'api-readme.md'), 'utf8').trim();
/** A table cell: one line, with the characters that would end the cell escaped. */
const cell = (text: string) => text.replaceAll('|', '\\|').replace(/\s+/g, ' ').trim();

const { packages } = loadProject();
const sections = groupPackages(packages).map((area) => {
    const rows = area.packages.map((pkg) => {
        const name = pkg.name.slice(pkg.name.indexOf('/') + 1);
        return `| [${name}](${pkg.name}/index.md) | ${cell(pkg.description)} |`;
    });
    return [`## ${area.title}`, '', area.description, '', '| Package | Description |', '| --- | --- |', ...rows].join(
        '\n'
    );
});

const scope = packages[0]?.name.split('/')[0] ?? '';
writeFileSync(
    path.join(packageDirectory, 'site', 'api', 'index.md'),
    `${intro}\n\nEvery package is published under the \`${scope}\` scope.\n\n${sections.join('\n\n')}\n`
);
