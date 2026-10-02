/**
 * Which blocks obey which bit of physics.
 *
 * Keyed by block state name rather than by the registered `Block` classes, deliberately. The class
 * registry covers eighty of the twelve hundred blocks the client knows, and `World.getBlock` hands
 * back air for anything outside it - so a rule that consulted the classes would silently do nothing
 * for most of what world generation actually places, which is the worst possible failure for
 * physics: it looks implemented and is not.
 *
 * This mirrors how `entity/ai/BlockView` decides what a mob can walk through, for the same reason.
 */

/**
 * Blocks that need something underneath them and break without it.
 *
 * A plant is not attached to the ground so much as resting on it, so removing what it stands on
 * removes the plant. Vanilla drops it rather than deleting it, which is what makes mining under a
 * field of wheat give you the wheat.
 */
export const NEEDS_SUPPORT: ReadonlySet<string> = new Set([
    'minecraft:short_grass',
    'minecraft:tall_grass',
    'minecraft:fern',
    'minecraft:large_fern',
    'minecraft:deadbush',
    'minecraft:dandelion',
    'minecraft:poppy',
    'minecraft:red_flower',
    'minecraft:yellow_flower',
    'minecraft:wheat',
    'minecraft:carrots',
    'minecraft:potatoes',
    'minecraft:beetroot',
    'minecraft:sapling',
    'minecraft:torchflower',
    'minecraft:torchflower_crop',
    'minecraft:pitcher_crop',
    'minecraft:sweet_berry_bush',
    'minecraft:snow_layer',
    'minecraft:cactus',
    'minecraft:sugar_cane',
    'minecraft:reeds',
    'minecraft:nether_wart',
    'minecraft:rail',
    'minecraft:golden_rail',
    'minecraft:detector_rail',
    'minecraft:activator_rail',
    'minecraft:redstone_wire',
    'minecraft:carpet',
    'minecraft:pressure_plate',
    'minecraft:flower_pot'
]);

/** The families of the above, so a block nobody listed by name is still covered. */
export const NEEDS_SUPPORT_SUFFIXES: readonly string[] = [
    '_sapling',
    '_carpet',
    '_pressure_plate',
    '_flower',
    '_tulip',
    '_orchid',
    '_mushroom'
];

/**
 * Blocks that fall when nothing holds them up.
 *
 * The short vanilla list: the powders, plus anvils. Everything else stays where it is put, which is
 * why a stone ceiling is a ceiling.
 */
export const FALLS: ReadonlySet<string> = new Set([
    'minecraft:sand',
    'minecraft:red_sand',
    'minecraft:gravel',
    'minecraft:suspicious_sand',
    'minecraft:suspicious_gravel',
    'minecraft:anvil',
    'minecraft:concrete_powder',
    'minecraft:white_concrete_powder',
    'minecraft:orange_concrete_powder',
    'minecraft:magenta_concrete_powder',
    'minecraft:light_blue_concrete_powder',
    'minecraft:yellow_concrete_powder',
    'minecraft:lime_concrete_powder',
    'minecraft:pink_concrete_powder',
    'minecraft:gray_concrete_powder',
    'minecraft:light_gray_concrete_powder',
    'minecraft:cyan_concrete_powder',
    'minecraft:purple_concrete_powder',
    'minecraft:blue_concrete_powder',
    'minecraft:brown_concrete_powder',
    'minecraft:green_concrete_powder',
    'minecraft:red_concrete_powder',
    'minecraft:black_concrete_powder'
]);

/** The still and moving forms of each liquid, which physics has to treat as one substance. */
export interface LiquidKind {
    readonly still: string;
    readonly flowing: string;

    /** Ticks between one spread and the next. Water is quick; lava crawls. */
    readonly spreadDelay: number;

    /** How many blocks it travels from its source before running out. */
    readonly reach: number;
}

export const WATER: LiquidKind = {
    still: 'minecraft:water',
    flowing: 'minecraft:flowing_water',
    spreadDelay: 5,
    reach: 7
};

export const LAVA: LiquidKind = {
    still: 'minecraft:lava',
    flowing: 'minecraft:flowing_lava',
    spreadDelay: 30,
    reach: 3
};

export const LIQUIDS: readonly LiquidKind[] = [WATER, LAVA];

/** The liquid a block is, if it is one. */
export const liquidOf = (name: string): LiquidKind | null =>
    LIQUIDS.find((liquid) => liquid.still === name || liquid.flowing === name) ?? null;

/**
 * Blocks a liquid washes away rather than flows around.
 *
 * Vanilla drowns plants rather than damming water behind them, which is also what stops a field of
 * wheat from holding back a river.
 */
export const WASHED_AWAY: ReadonlySet<string> = new Set([
    'minecraft:air',
    'minecraft:short_grass',
    'minecraft:tall_grass',
    'minecraft:fern',
    'minecraft:large_fern',
    'minecraft:deadbush',
    'minecraft:dandelion',
    'minecraft:poppy',
    'minecraft:red_flower',
    'minecraft:yellow_flower',
    'minecraft:wheat',
    'minecraft:carrots',
    'minecraft:potatoes',
    'minecraft:beetroot',
    'minecraft:torch',
    'minecraft:snow_layer',
    'minecraft:sugar_cane',
    'minecraft:reeds'
]);

/**
 * Whether a block needs something beneath it.
 * @param {string} name - The block's state name.
 * @returns {boolean} Whether it breaks when its support goes.
 */
export const needsSupport = (name: string): boolean =>
    NEEDS_SUPPORT.has(name) || NEEDS_SUPPORT_SUFFIXES.some((suffix) => name.endsWith(suffix));

/**
 * Whether a block falls under its own weight.
 * @param {string} name - The block's state name.
 * @returns {boolean} Whether gravity applies to it.
 */
export const falls = (name: string): boolean => FALLS.has(name);

/**
 * Whether a liquid may take this block's place.
 * @param {string} name - The block's state name.
 * @returns {boolean} Whether liquid flows into it.
 */
export const isWashedAway = (name: string): boolean => WASHED_AWAY.has(name);

/**
 * `liquid_depth` for a flowing liquid.
 *
 * Zero is a source and one to seven are the thinning steps away from it. The fourth bit marks
 * liquid that is falling, which vanilla treats as full strength however far it has come - which is
 * why a waterfall stays a waterfall all the way down.
 */
export const FALLING_DEPTH_FLAG = 8;

/** Whether a depth describes falling liquid. */
export const isFalling = (depth: number): boolean => (depth & FALLING_DEPTH_FLAG) !== 0;

/** How far from its source a depth is, ignoring whether it is falling. */
export const spreadOf = (depth: number): number => depth & 0x7;
