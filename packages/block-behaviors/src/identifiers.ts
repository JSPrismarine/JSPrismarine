/**
 * The block identifiers the families name directly, and the few name sets no
 * table publishes.
 *
 * A family reads what it can from the block's own components. The sets here
 * are the exceptions: Bedrock has no component for "is a liquid" or "a
 * placement overwrites this", and the Java classes that decide them are not
 * in the repository, so the names are written down once with the rule they
 * encode rather than repeated across families.
 */
import { bareName } from './state';

/** The identifier an empty position holds. */
export const AIR = 'minecraft:air';

/** The water source block. */
export const WATER = 'minecraft:water';

/** The flowing water block, which carries the spread depth. */
export const FLOWING_WATER = 'minecraft:flowing_water';

/** The lava source block. */
export const LAVA = 'minecraft:lava';

/** The flowing lava block. */
export const FLOWING_LAVA = 'minecraft:flowing_lava';

/** What lava makes when water reaches a source. */
export const OBSIDIAN = 'minecraft:obsidian';

/** What lava makes when water reaches flowing lava from the side. */
export const COBBLESTONE = 'minecraft:cobblestone';

/** What lava makes when it flows down into water. */
export const STONE = 'minecraft:stone';

/** Whether the identifier is air, which is what an empty position reads as. */
export const isAir = (identifier: string): boolean => bareName(identifier) === 'air';

/** Whether the identifier is water, source or flowing. */
export const isWater = (identifier: string): boolean => {
    const name = bareName(identifier);
    return name === 'water' || name === 'flowing_water';
};

/** Whether the identifier is lava, source or flowing. */
export const isLava = (identifier: string): boolean => {
    const name = bareName(identifier);
    return name === 'lava' || name === 'flowing_lava';
};

/** Whether the identifier is either liquid. */
export const isLiquid = (identifier: string): boolean => isWater(identifier) || isLava(identifier);

/** Whether the identifier is a liquid's source block rather than its flowing one. */
export const isLiquidSource = (identifier: string): boolean => {
    const name = bareName(identifier);
    return name === 'water' || name === 'lava';
};

/** The flowing form of a liquid, which is the block a spread writes. */
export const flowingForm = (identifier: string): string => (isLava(identifier) ? FLOWING_LAVA : FLOWING_WATER);

/**
 * The blocks a placement overwrites instead of being refused, and that a
 * falling block passes through.
 *
 * Java decides this with a material flag that no published table carries, so
 * the list is the vanilla set of one-block plants, the two fires, both
 * liquids and the engine markers.
 */
export const REPLACEABLE_NAMES: ReadonlySet<string> = new Set([
    'air',
    'structure_void',
    'water',
    'flowing_water',
    'lava',
    'flowing_lava',
    'fire',
    'soul_fire',
    'bubble_column',
    'short_grass',
    'tall_grass',
    'fern',
    'large_fern',
    'deadbush',
    'seagrass',
    'kelp',
    'snow_layer',
    'vine',
    'glow_lichen',
    'hanging_roots',
    'nether_sprouts',
    'warped_roots',
    'crimson_roots'
]);

/** Whether a placement overwrites the block rather than being refused. */
export const isReplaceable = (identifier: string): boolean => REPLACEABLE_NAMES.has(bareName(identifier));
