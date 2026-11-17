/**
 * Counts the Script API uses of the add-on corpus pinned in `corpus/packs.json`, and writes
 * `corpus/usage.json` and `corpus/ranking.md`.
 *
 * Fetches each pinned repository into the shared cache when it is missing, and reuses the cached
 * copy after that. With `--check` it writes nothing, and fails when either file differs from what
 * the pinned corpus and the generated shape count.
 *
 *     node scripts/count-corpus.mts [--check]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { SCRIPT_METADATA_SOURCE, SCRIPT_MODULE_HISTORIES } from '../src/generated/scriptModules.ts';
import { countCorpus, corpusFiles } from './corpus/corpus.mts';
import { CORPUS_DIR, readCorpusManifest } from './corpus/manifest.mts';
import { COUNT_COMMAND } from './corpus/report.mts';

const { values } = parseArgs({ options: { check: { type: 'boolean', default: false } } });

const manifest = readCorpusManifest();
const packs = await countCorpus(manifest, SCRIPT_MODULE_HISTORIES, {
    onRepository: (repository, root) => console.log(`${repository.name} ${repository.commit.slice(0, 12)}: ${root}`)
});
const files = corpusFiles(manifest, packs, SCRIPT_METADATA_SOURCE);

if (values.check) {
    const stale = [...files].filter(([file, content]) => {
        try {
            return readFileSync(join(CORPUS_DIR, file), 'utf8') !== content;
        } catch {
            return true;
        }
    });
    if (stale.length > 0) {
        for (const [file] of stale) console.error(`corpus/${file} is out of date`);
        console.error(`Run \`${COUNT_COMMAND}\` and commit the result.`);
        process.exit(1);
    }
    console.log(`The corpus counts match the ${packs.length} pinned packs`);
} else {
    for (const [file, content] of files) writeFileSync(join(CORPUS_DIR, file), content);
    console.log(`Counted ${packs.length} packs into corpus/${[...files.keys()].join(' and corpus/')}`);
}
