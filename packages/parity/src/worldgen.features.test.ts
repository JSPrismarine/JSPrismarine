import { expect, it } from 'vitest';

import { FAMILIES } from './families.ts';
import { loadReferenceWorld } from './goldens.ts';
import { describeFamily } from './measure.ts';
import { REFERENCES } from './references.ts';

/**
 * Phase 4's other exit criterion: ore and feature counts within a measured distribution.
 *
 * This row is not measured, and that is the whole of what it reports today. The one thing it
 * needs is the reference world `dump:bedrock` generates, which carries both halves of the
 * criterion: a region to count over, and `blockCounts`, the histogram of how many blocks of
 * each identifier a Bedrock Dedicated Server actually placed across it. Mojang publishes that
 * server as a Linux x86-64 binary, so the golden comes out of CI and no developer machine here
 * can produce one. Counting the server's own placements and calling the result parity would
 * compare the server with itself, so the row waits.
 *
 * The row used to require a second source, a separately captured feature distribution, which
 * nothing was ever going to produce: the distribution is the reference world's own histogram.
 * Requiring both meant the row would have stayed "not measured" after the golden landed, which
 * is the failure mode this suite exists to avoid, so it now stands on the one source that
 * exists. `loadReferenceWorld` checks the golden's format version, so a capture job that
 * changes shape fails this row rather than being read wrong.
 */
describeFamily(FAMILIES.worldgenFeatures, [REFERENCES.referenceWorld], () => {
    const golden = loadReferenceWorld();
    const region = golden.region.chunksX * golden.region.chunksZ;

    it('reads a reference region worth of captured chunks', () => {
        expect(golden.chunks).toHaveLength(region);
        expect(Object.keys(golden.blockCounts).length).toBeGreaterThan(0);
    });

    it('places ores and features within the distribution the reference world holds', () => {
        // Reached only once the golden lands. The comparison is a run of the server's own
        // decoration pass over `golden.region` at `golden.seed`, reduced to the same layer 0
        // block histogram, compared against `golden.blockCounts` ore by ore and feature by
        // feature. Nothing in this package can produce that histogram today: the decoration
        // pass needs terrain to place onto, which means the whole generator, and the generator
        // lives in `packages/prismarine`, which this package does not depend on. Whoever lands
        // the golden lands the generator run with it.
        expect.fail(
            `The reference world is here: ${golden.chunks.length} chunks at seed ${golden.seed} from Bedrock ` +
                `${golden.minecraftVersion}, with ${Object.keys(golden.blockCounts).length} block identifiers ` +
                'counted over the region. Run the generator over the same region and compare the histogram.'
        );
    });
});
