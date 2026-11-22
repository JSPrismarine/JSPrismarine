import { isRecord } from '../utils/isRecord';

/**
 * A mob world generation decided should exist, recorded rather than created.
 *
 * The generator builds chunks and knows nothing about the world they will belong to - it has no
 * entity list to add to, and a chunk may well be generated long before anything asks for it. So a
 * pass that builds a village says "a villager belongs here" and the world creates it when the
 * chunk is first loaded.
 *
 * Deliberately data rather than an `Entity`: an entity needs a `Position`, a position needs a
 * world, and a world is exactly what the generator does not have.
 */
export interface EntitySpawn {
    /** The entity's namespace id, e.g. `minecraft:villager`. */
    readonly type: string;

    /** Where it stands, in world coordinates. Feet position, as an entity's position is. */
    readonly x: number;
    readonly y: number;
    readonly z: number;

    /** Which way it faces, in degrees. */
    readonly yaw?: number;

    /** The block an end crystal's beam points at, Java's `crystal_beam_target`. */
    readonly beamTarget?: { readonly x: number; readonly y: number; readonly z: number };

    /** Whether an end crystal renders its base plate; absent keeps the client default, true. */
    readonly showBottom?: boolean;

    /** Whether the entity ignores damage, Java's `crystal_invulnerable`. */
    readonly invulnerable?: boolean;
}

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** A block position out of parsed JSON, or undefined when it is not one. */
const blockPositionOf = (value: unknown): EntitySpawn['beamTarget'] => {
    if (!isRecord(value)) return undefined;
    const { x, y, z } = value;
    return isFiniteNumber(x) && isFiniteNumber(y) && isFiniteNumber(z) ? { x, y, z } : undefined;
};

/**
 * A spawn out of parsed JSON, such as a pending record a fresh chunk's write keeps, or undefined
 * when it is not one. A field that does not parse is left out.
 */
export const entitySpawnOf = (value: unknown): EntitySpawn | undefined => {
    if (!isRecord(value) || typeof value.type !== 'string') return undefined;
    const { type, x, y, z, yaw, showBottom, invulnerable } = value;
    if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isFiniteNumber(z)) return undefined;
    const beamTarget = blockPositionOf(value.beamTarget);
    return {
        type,
        x,
        y,
        z,
        ...(isFiniteNumber(yaw) ? { yaw } : {}),
        ...(beamTarget === undefined ? {} : { beamTarget }),
        ...(typeof showBottom === 'boolean' ? { showBottom } : {}),
        ...(typeof invulnerable === 'boolean' ? { invulnerable } : {})
    };
};
