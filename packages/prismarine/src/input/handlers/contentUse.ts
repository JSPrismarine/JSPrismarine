import type { UnitOutcome } from '../../entity/data/EntityStore';
import type { InteractionResult } from '../../item/interaction';
import type { HandlerLog } from '../../player/context/HandlerContext';
import type { World } from '../../world/World';

/**
 * Runs the content's handling of one click as a unit of the world's change log, nested in the
 * input's own. A behavior that throws has what it wrote undone, its error goes to the log, and
 * the click declines.
 *
 * The error stops here rather than at the input's unit, which would undo the writes as well: a
 * Java connection closes when an input it sent throws, and one broken behavior must not
 * disconnect the player who clicked.
 *
 * @param world - The world the click is in, whose entity store holds the log.
 * @param log - Where a behavior's error goes.
 * @param use - The content path for the click.
 * @returns What `use` returned, or `declined` when it threw.
 */
export const runContentUse = (
    world: Pick<World, 'getEntityStore'>,
    log: Pick<HandlerLog, 'error'>,
    use: () => InteractionResult
): InteractionResult => {
    let result: InteractionResult = 'declined';
    let outcome: UnitOutcome;
    try {
        outcome = world.getEntityStore().unit(() => {
            result = use();
        });
    } catch (error: unknown) {
        // With no log tick open the unit runs its work as it is, and a throw arrives here.
        outcome = { failed: true, error };
    }
    if (!outcome.failed) return result;
    log.error(outcome.error);
    return 'declined';
};
