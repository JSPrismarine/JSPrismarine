/**
 * Java Edition's lead lengths, which the leash rules in `EntityRuntime` apply.
 *
 * Bedrock's `minecraft:leashable` presets describe the spring the client draws, not when a lead
 * breaks, so the break distance is Java's: `Leashable.leashSnapDistance` returns 12 blocks, and
 * the ghast and happy ghast override it with 16.
 */

/** How far a leashed entity may get from its holder before the lead snaps, in blocks. */
export const LEASH_SNAP_DISTANCE = 12;

/** The entity types whose own snap distance replaces {@link LEASH_SNAP_DISTANCE}. */
const SNAP_DISTANCE_OVERRIDES: Readonly<Record<string, number>> = {
    'minecraft:ghast': 16,
    'minecraft:happy_ghast': 16
};

/** The distance past which a lead on an entity of this type snaps, as Java's `leashSnapDistance`. */
export const leashSnapDistance = (identifier: string): number =>
    SNAP_DISTANCE_OVERRIDES[identifier] ?? LEASH_SNAP_DISTANCE;
