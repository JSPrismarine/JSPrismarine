import { defineErrors } from '@jsprismarine/errors/JSPrismarineError';

/** The errors `@jsprismarine/predicates` throws. */
export const PredicatesErrors = defineErrors('predicates', {
    /**
     * A saved random state is not a 32-bit integer, so the save or the replay that holds it is
     * damaged.
     */
    InvalidMulberry32RandomState: { message: 'Invalid mulberry32 random state', base: TypeError },
    /** A test made a scripted random source with no values to replay. */
    ScriptedrandomNeedsAtLeastOneValue: 'scriptedRandom needs at least one value'
});
