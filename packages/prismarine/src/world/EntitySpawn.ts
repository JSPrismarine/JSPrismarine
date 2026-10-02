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
}
