/**
 * The y a structure is told to start at.
 *
 * Java's `start_height` and `height` fields are full `HeightProvider`s, and
 * `@jsprismarine/features` implements all six forms. They are not reused here because a provider
 * samples through `@jsprismarine/worldgen`'s random interface while a structure draws through
 * `@jsprismarine/structures`' narrower one, and bridging the two would mean inventing answers
 * for members no height provider asks for.
 *
 * The anchors, which are the part that depends on the dimension, do come from the features
 * package. Only the two forms the 52 structures use are read: a bare anchor, which Java's codec
 * reads as a constant, and the `uniform` the nether fossil carries.
 */
import type { VerticalAnchor, VerticalContext } from '@jsprismarine/features';
import { parseVerticalAnchor, resolveAnchor } from '@jsprismarine/features';
import type { RandomSource } from '@jsprismarine/structures';

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Draws the y a structure starts at.
 *
 * @param fallback - The y for a field that is absent, which 24 of the 52 structures leave out.
 * @returns The drawn y, having consumed the draws Java's provider consumes.
 */
export const sampleStructureHeight = (
    definition: unknown,
    random: RandomSource,
    context: VerticalContext,
    fallback: number
): number => {
    if (!isRecord(definition)) return fallback;

    if (definition.type === 'minecraft:uniform' || definition.type === 'uniform') {
        const low = resolveAnchor(anchorOf(definition.min_inclusive, context), context);
        const high = resolveAnchor(anchorOf(definition.max_inclusive, context), context);
        // Java collapses an inverted range to its minimum rather than failing, and costs one draw.
        return high <= low ? low : low + random.nextInt(high - low + 1);
    }

    return resolveAnchor(anchorOf(definition, context), context);
};

/** Reads an anchor, treating one this server cannot parse as the dimension's floor. */
const anchorOf = (value: unknown, context: VerticalContext): VerticalAnchor => {
    try {
        return parseVerticalAnchor(value, 'start_height');
    } catch {
        // Extracted game data: an unreadable anchor starts the structure at the dimension floor,
        // which is a structure in the wrong place rather than a world that fails to generate.
        return { kind: 'absolute', y: context.minY };
    }
};
