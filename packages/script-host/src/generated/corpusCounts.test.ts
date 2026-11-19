import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import { corpusFiles, countCorpus } from '../../scripts/corpus/corpus.mts';
import { isCorpusCached } from '../../scripts/corpus/fetch.mts';
import { CORPUS_DIR, readCorpusManifest } from '../../scripts/corpus/manifest.mts';
import { COUNT_COMMAND } from '../../scripts/corpus/report.mts';
import { SCRIPT_METADATA_SOURCE, SCRIPT_MODULE_HISTORIES } from './scriptModules.ts';

const manifest = readCorpusManifest();
// Runs when every pinned repository is cached, so ordinary runs need no network.
// `JSP_ADDON_CORPUS_TESTS=1` fetches what is missing instead of skipping.
const enabled = process.env.JSP_ADDON_CORPUS_TESTS === '1' || (await isCorpusCached(manifest));

// The corpus counts derive from the generated shape, so the suite sits beside it.
describe.skipIf(!enabled)('the checked-in corpus counts', { tags: ['real-data'] }, () => {
    let files: Map<string, string>;

    // Counting walks every pinned repository, and a cold cache fetches them first.
    beforeAll(async () => {
        files = corpusFiles(manifest, await countCorpus(manifest, SCRIPT_MODULE_HISTORIES), SCRIPT_METADATA_SOURCE);
    }, 300_000);

    it('are what the pinned corpus counts', () => {
        for (const [file, content] of files) {
            expect(readFileSync(join(CORPUS_DIR, file), 'utf8'), `corpus/${file} is stale: run ${COUNT_COMMAND}`).toBe(
                content
            );
        }
    });
});
