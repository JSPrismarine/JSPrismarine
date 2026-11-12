/**
 * Writes the current docs facts into the Markdown that marks them, or checks that every marker names a
 * known fact. See `facts.mts` for the marker format.
 *
 *     node --import tsx facts-cli.mts --write   # refresh the values in the source
 *     node --import tsx facts-cli.mts --check   # fail on unknown markers, report stale values
 *
 * A stale value is reported, not failed: the docs build fills in the current value anyway, so a code
 * change never has to wait for a docs edit.
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { applyFacts, loadFacts } from './facts.mts';
import { repoRoot } from './project.mts';
import { rootPages } from './sections.mts';

const write = process.argv.includes('--write');

/** Package pages outside the docs tree that quote values the code owns. */
const packagePages = ['packages/parity/README.md', 'tools/client-e2e/README.md'];

/**
 * Every Markdown file a fact marker may sit in: the docs tree, the root README, the root pages and
 * the package pages above.
 */
function markdownFiles() {
    const docs = readdirSync(path.join(repoRoot, 'docs'), { recursive: true, encoding: 'utf8' })
        .filter((entry) => entry.endsWith('.md'))
        .map((entry) => path.join('docs', entry));
    return ['README.md', ...rootPages.map(({ source }) => source), ...packagePages, ...docs];
}

const { values: facts, missing } = await loadFacts();
if (missing.length) {
    console.log(`Not on disk, so their facts keep the Markdown's values: ${missing.join('; ')}.`);
    console.log('`pnpm --filter @jsprismarine/docs run docs:sources` fetches them.');
}
let unknown = 0;
let stale = 0;
for (const file of markdownFiles()) {
    const absolute = path.join(repoRoot, file);
    const source = readFileSync(absolute, 'utf8');
    const result = applyFacts(source, facts, { keepMarkers: true });
    for (const name of result.unknown) console.error(`${file}: unknown fact "${name}"`);
    unknown += result.unknown.length;
    stale += result.stale.length;
    if (write && result.text !== source) {
        writeFileSync(absolute, result.text);
        console.log(`${file}: updated ${result.stale.map(({ name }) => name).join(', ')}`);
    } else {
        for (const { name, was, now } of result.stale)
            console.log(`${file}: ${name} is ${now}, the source says ${was}`);
    }
}

if (!write && stale) console.log(`${stale} stale value(s); run \`pnpm run docs:facts\` to refresh them.`);
if (unknown) {
    console.error(`${unknown} marker(s) name no fact. The facts are listed in tools/docs/facts.mts.`);
    process.exit(1);
}
