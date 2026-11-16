/**
 * Block names as the vanilla entity files write them, resolved to the identifiers the world uses.
 *
 * The files write some names without a namespace (`dirt`, `grass`) and keep two of Bedrock's
 * legacy names: `grass` for the grass block and `tallgrass` for the short grass and fern that the
 * one legacy block split into. A block query compares full identifiers, so an unresolved name
 * matched nothing and the sheep and the enderman never found a block.
 */

/** Legacy names the vanilla files still write, with the blocks each one stands for now. */
const LEGACY_BLOCK_NAMES: Readonly<Record<string, readonly string[]>> = {
    'minecraft:grass': ['minecraft:grass_block'],
    'minecraft:tallgrass': ['minecraft:short_grass', 'minecraft:fern']
};

/**
 * The block identifiers one name from an entity file stands for.
 *
 * @param name - A block name as written, such as `dirt`, `minecraft:grass` or `tallgrass`.
 * @returns The namespaced identifiers, more than one for a legacy name that split.
 */
export const blockIdentifiersOf = (name: string): readonly string[] => {
    const qualified = name.includes(':') ? name : `minecraft:${name}`;
    return LEGACY_BLOCK_NAMES[qualified] ?? [qualified];
};
