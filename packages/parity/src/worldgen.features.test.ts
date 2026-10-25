import { expect, it } from 'vitest';

import { FAMILIES } from './families.ts';
import { describeFamily } from './measure.ts';
import { REFERENCES } from './references.ts';

/**
 * Phase 4's other exit criterion: ore and feature counts within a measured distribution.
 *
 * This row is not measured, and that is the whole of what it reports today. The criterion
 * needs two things the repository does not have. One is the generated reference world of plan
 * section 6 step 4, so a count has a region to be counted over. The other is the distribution
 * itself: how many ore veins and features of each kind Java places per chunk, and how widely
 * that number swings, which nothing in either edition's published data states and no capture
 * job here samples.
 *
 * Counting the server's own placements and calling the result parity would compare the server
 * with itself, so the row stays not measured until a capture lands. `describeFamily` turns the
 * two missing sources into one skipped test, and the dashboard renders the family as "not
 * measured" rather than green.
 */
describeFamily(FAMILIES.worldgenFeatures, [REFERENCES.referenceWorld, REFERENCES.featureDistribution], () => {
    it('places ores and features within the distribution Java produces', () => {
        // Reached only once both sources exist. Whoever lands them writes the comparison here:
        // count each configured feature's placements over the reference region, and check the
        // count against the dumped distribution.
        expect.fail(
            'The reference world and the feature distribution both exist now, so this row has data to stand on. Write the count comparison.'
        );
    });
});
