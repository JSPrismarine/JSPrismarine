/**
 * The two per-state block values the light engine reads.
 *
 * `@jsprismarine/mapping`'s `BedrockBlockProperties` already has both fields with these names, so a
 * property row from `bedrockBlockPropertiesOf` satisfies this type without conversion. The engine
 * declares its own shape rather than importing it so that `@jsprismarine/lighting` depends on
 * nothing.
 */
export interface BlockLightProperties {
    /** The light the block emits, 0 to 15. Glowstone and a lantern are 15, a torch 14. */
    readonly lightEmission: number;
    /**
     * The light the block swallows, 0 to 15. A full opaque block is 15, air and glass are 0.
     * Light entering the block loses `max(1, lightDampening)` levels, so a dampening of 15 stops
     * it. Bedrock applies one scalar in every direction; Java's per-face opacity is deliberately
     * not modeled, see the package README.
     */
    readonly lightDampening: number;
}

/**
 * The world as the light engine sees it: one lookup that answers what a block does to light, and
 * whether that block is loaded at all.
 *
 * The server injects an implementation. The engine never touches chunk, block or world classes, so
 * the two sides can change independently and the engine is testable against a plain array. See
 * `@jsprismarine/lighting/testing` for a double that implements this interface.
 *
 * Positions outside `minY` to `maxY` are never queried; the engine bounds-checks first. Everything
 * else that returns `undefined` is an unloaded chunk, and the engine defers the propagation that
 * would have crossed into it rather than treating it as opaque.
 */
export interface BlockLightView {
    /** The lowest block y in the dimension, inclusive. Overworld worlds use -64. */
    readonly minY: number;
    /** One past the highest block y in the dimension. The overworld uses 320, the nether 128. */
    readonly maxY: number;
    /**
     * Whether the dimension has a sky. The nether and the end have none, so the engine keeps the
     * sky layer at 0 there and skips heightmap work entirely.
     */
    readonly hasSkyLight: boolean;

    /**
     * The light properties of the block at a world position.
     * @param {number} x - World x.
     * @param {number} y - World y, always within `minY` to `maxY`.
     * @param {number} z - World z.
     * @returns {BlockLightProperties | undefined} The block's properties, or `undefined` when the
     * chunk holding the position is not loaded.
     */
    blockAt(x: number, y: number, z: number): BlockLightProperties | undefined;
}
