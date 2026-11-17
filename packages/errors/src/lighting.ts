import { defineErrors } from '@jsprismarine/errors/JSPrismarineError';

/** The errors `@jsprismarine/lighting` throws. */
export const LightingErrors = defineErrors('lighting', {
    /**
     * Code read or wrote light at a position outside the 16-block section. This is a bug in the
     * caller.
     */
    LightOutsideSection: {
        message: 'Light coordinates ({x}, {z}, {y}) fall outside the section',
        base: RangeError
    },
    /** The light engine was given a budget that is not a whole, non-negative number of nodes. */
    InvalidFlushBudget: { message: 'Light flush budget {budget} is not a count of nodes', base: RangeError },
    /** Code tried to store a light level that is not a whole number from 0 to the highest level. */
    InvalidLightLevel: {
        message: 'Light level {level} is not an integer between 0 and {maxLightLevel}',
        base: RangeError
    },
    /** The light engine was given a budget that is not a whole, non-negative number of nodes. */
    InvalidSettleBudget: { message: 'Light settle budget {budget} is not a count of nodes', base: RangeError }
});
