import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

// Imported so a change to the generated shape selects this suite under `vitest --changed`.
import { SCRIPT_METADATA_SOURCE, SCRIPT_MODULE_HISTORIES } from '../../src/generated/scriptModules.ts';
import { corpusFiles, countCorpus } from './corpus.mts';
import { isCorpusCached } from './fetch.mts';
import { CORPUS_DIR, readCorpusManifest } from './manifest.mts';
import { COUNT_COMMAND } from './report.mts';

const manifest = readCorpusManifest();
// Runs when every pinned repository is cached, so ordinary runs need no network.
// `JSP_ADDON_CORPUS_TESTS=1` fetches what is missing instead of skipping.
const enabled = process.env.JSP_ADDON_CORPUS_TESTS === '1' || (await isCorpusCached(manifest));

describe.skipIf(!enabled)('the checked-in corpus counts', { tags: ['real-data'] }, () => {
    it('are what the pinned corpus counts', async () => {
        const packs = await countCorpus(manifest, SCRIPT_MODULE_HISTORIES);
        for (const [file, content] of corpusFiles(manifest, packs, SCRIPT_METADATA_SOURCE)) {
            expect(readFileSync(join(CORPUS_DIR, file), 'utf8'), `corpus/${file} is stale: run ${COUNT_COMMAND}`).toBe(
                content
            );
        }
    }, 300_000);
});
