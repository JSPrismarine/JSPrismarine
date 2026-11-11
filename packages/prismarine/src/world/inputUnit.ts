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
 * Applies one input from a player's session as a unit of the world the player is in.
 *
 * A session with no player behind it, such as a test double, applies the input outside any
 * unit, as every input was applied before the store existed.
 *
 * @param session - The session the packet arrived on.
 * @param apply - The handler, applied to that session.
 */
export const applyInput = async (session: PlayerSession, apply: () => Promise<void> | void): Promise<void> => {
    // Read through optional calls: a dispatcher test hands handlers a partial session.
    const world = session.getWorld?.();
    if (world === undefined) return apply();
    return world.runInput(async () => apply());
};
