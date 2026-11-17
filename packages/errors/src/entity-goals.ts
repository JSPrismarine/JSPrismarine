import { defineErrors } from '@jsprismarine/errors/JSPrismarineError';

/** The errors `@jsprismarine/entity-goals` throws. */
export const EntityGoalsErrors = defineErrors('entity-goals', {
    /** The goal harness could not load its test entity. The message joins the load's error diagnostics with `; `. */
    TestEntityDidNotLoad: '{diagnostics}'
});
