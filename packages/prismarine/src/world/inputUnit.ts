/**
 * Where an input-lane packet becomes a unit of a world's change log.
 *
 * An input is applied in the input step of the world its sender's entity is in (ADR 0009), so
 * its span is opened in that world's entity store: when the handler throws, what it wrote to
 * that world's entities is undone before the dispatcher reports the error
 * ([ADR 0015](../../../../docs/adr/0015-a-tick-is-a-fixed-sequence-of-synchronous-phases.md)).
 */
import type PlayerSession from '../network/PlayerSession';

/**
 * Applies one input from a player's session as a unit of the world the player is in. The unit
 * opens and closes around the call, so nothing another input or the tick does lands in its span.
 *
 * A session with no player behind it, such as a test double, applies the input outside any
 * unit, as every input was applied before the store existed.
 *
 * @param session - The session the packet arrived on.
 * @param apply - The handler, applied to that session.
 */
export const applyInputNow = (session: PlayerSession, apply: () => void): void => {
    // Read through optional calls: a dispatcher test hands handlers a partial session.
    const world = session.getWorld?.();
    if (world === undefined) {
        apply();
        return;
    }
    world.runInputNow(apply);
};

/**
 * Runs work once the input being applied for a session has committed, and drops it when the
 * input is undone. For state the change log does not hold, which an undo would leave as the
 * input set it.
 *
 * Read the same way {@link applyInputNow} reads the world, so a session with no world behind it
 * runs the work now, as it applies the input outside any unit.
 *
 * @param session - The session the packet arrived on.
 * @param work - What to run once the input's writes stand.
 */
export const whenInputCommits = (session: PlayerSession, work: () => void): void => {
    const world = session.getWorld?.();
    if (world === undefined) {
        work();
        return;
    }
    world.getEntityStore().afterUnit((kept) => {
        if (kept) work();
    });
};
