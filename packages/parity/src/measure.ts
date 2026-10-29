import { describe, it } from 'vitest';
import type { SuiteOptions } from 'vitest';

import type { Family } from './families.ts';
import type { ReferenceSource } from './references.ts';
import { missingReferences, notMeasuredReason } from './references.ts';

/** The marker a not-measured test's title starts with, so the dashboard can recognize one. */
export const NOT_MEASURED_PREFIX = 'not measured:';

/**
 * Declares one family's tests, guarded by the reference data they compare against. Optional
 * Vitest suite options let each caller declare tags and other suite behavior explicitly.
 *
 * With every source present the body runs and the family's tests pass or fail on the
 * comparison. With a source missing the body does not run at all, and the family gets one
 * skipped test whose title names what is missing. The dashboard renders that as "not
 * measured", which is the honest answer: a comparison that compared nothing is not a pass.
 * @param family - The family id, which is also the describe title the dashboard groups by.
 * @param requires - The reference sources every test in the body reads.
 * @param body - The tests, run only when all sources are present.
 * @param options - Optional Vitest suite tags applied to this family.
 * @example
 * ```typescript
 * describeFamily(FAMILIES.worldgenFeatures, [REFERENCES.referenceWorld], () => {
 *     it('places ores within the measured spread', () => {
 *         // ...
 *     });
 * });
 * ```
 */
export const describeFamily = (
    family: Family,
    requires: readonly ReferenceSource[],
    body: () => void,
    options: Pick<SuiteOptions, 'tags'> = {}
): void => {
    const missing = missingReferences(requires);

    describe(family, options, () => {
        if (missing.length === 0) {
            body();
            return;
        }
        it.skip(`${NOT_MEASURED_PREFIX} ${notMeasuredReason(missing)}`, () => {});
    });
};
