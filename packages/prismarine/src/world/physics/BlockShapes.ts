import type { BlockStateValue } from '../../block/state/BlockState';

/**
 * How tall each block is to something walking on it.
 *
 * One number per block: the height of its top surface above the bottom of its own cell. `0` is a
 * block you walk straight through, `1` an ordinary cube, `0.5` a slab, `1.5` a fence. That single
 * number is the whole model, and it is enough for everything a mob does with the world: whether it
 * fits, what it is standing on, whether the thing in front is a step it can walk up, a wall it must
 * jump, or a fence it cannot pass at all.
 *
 * Keyed by block state name rather than by the registered `Block` classes, for the reason spelled
 * out in `BlockRules`: the class registry covers eighty of the twelve hundred blocks the client
 * knows, so a rule that consulted it would silently do nothing for most of what world generation
 * places. An unlisted block is a full cube, which is the safe way to be wrong.
 *
 * The numbers are the vanilla collision boxes, read out of the block shape tables rather than
 * measured by eye.
 * @see https://github.com/PrismarineJS/minecraft-data/tree/master/data/pc/1.21.4 `blockCollisionShapes.json`
 */

/** An ordinary cube, and what anything not named here is assumed to be. */
export const FULL_BLOCK = 1;

/** A block a mob walks straight through. */
export const PASSABLE = 0;

/**
 * Fences, walls and closed gates.
 *
 * Half a block taller than they look, which is the entire point of them: a mob's jump peaks at
 * 1.252 blocks, so one and a half is exactly the height that cannot be cleared. Modelling a fence
 * as a cube - which is what happens when a block is only ever solid or not - lets every animal
 * in the pen hop out.
 */
export const FENCE_HEIGHT = 1.5;

/**
 * Blocks a mob passes straight through.
 *
 * An allowlist rather than a denylist, because being wrong in the other direction turns a wall
 * into a doorway. `Block.isSolid` cannot be used for this: it returns false for everything except
 * air, so trusting it would make the whole world walkable.
 */
const PASSABLE_NAMES: ReadonlySet<string> = new Set([
    'minecraft:air',
    'minecraft:water',
    'minecraft:flowing_water',
    'minecraft:lava',
    'minecraft:flowing_lava',
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
    'minecraft:ladder',
    'minecraft:vine',
    'minecraft:fire',
    'minecraft:soul_fire',
    'minecraft:sweet_berry_bush',
    'minecraft:sugar_cane',
    'minecraft:reeds',
    'minecraft:nether_wart',
    'minecraft:redstone_wire',
    'minecraft:rail',
    'minecraft:golden_rail',
    'minecraft:detector_rail',
    'minecraft:activator_rail',
    // Doors count as ways through, not as walls: villagers are supposed to use their own doorways,
    // and a village whose mobs are all shut in their houses is worse than one where they wander.
    'minecraft:wooden_door',
    'minecraft:iron_door'
]);

/** Families of the above, matched by name so new members are covered without being listed. */
const PASSABLE_SUFFIXES: readonly string[] = [
    '_sapling',
    '_button',
    '_pressure_plate',
    '_sign',
    '_rail',
    '_torch',
    '_banner',
    '_flower',
    '_tulip',
    '_orchid',
    '_mushroom',
    '_door'
];

/** Blocks whose top sits at a fixed height, by exact name. */
const FIXED_TOPS: ReadonlyMap<string, number> = new Map([
    ['minecraft:farmland', 0.9375],
    ['minecraft:grass_path', 0.9375],
    ['minecraft:honey_block', 0.9375],
    ['minecraft:cactus', 0.9375],
    ['minecraft:soul_sand', 0.875],
    ['minecraft:mud', 0.875],
    ['minecraft:chest', 0.875],
    ['minecraft:ender_chest', 0.875],
    ['minecraft:trapped_chest', 0.875],
    ['minecraft:lectern', 0.875],
    ['minecraft:brewing_stand', 0.875],
    ['minecraft:end_portal_frame', 0.8125],
    ['minecraft:enchanting_table', 0.75],
    ['minecraft:conduit', 0.6875],
    ['minecraft:bed', 0.5625],
    ['minecraft:stonecutter', 0.5625],
    ['minecraft:stonecutter_block', 0.5625],
    ['minecraft:cake', 0.5],
    ['minecraft:turtle_egg', 0.4375],
    ['minecraft:daylight_detector', 0.375],
    ['minecraft:daylight_detector_inverted', 0.375],
    ['minecraft:flower_pot', 0.375],
    ['minecraft:unpowered_repeater', 0.125],
    ['minecraft:powered_repeater', 0.125],
    ['minecraft:unpowered_comparator', 0.125],
    ['minecraft:powered_comparator', 0.125],
    ['minecraft:waterlily', 0.09375],
    ['minecraft:lily_pad', 0.09375],
    // Named rather than left to the suffix rule below, which would read `snow_layer` as snow.
    ['minecraft:snow', FULL_BLOCK],
    ['minecraft:powder_snow', FULL_BLOCK]
]);

/** And by family. Order matters: the first match wins, so put the narrower suffix first. */
const SUFFIX_TOPS: ReadonlyArray<readonly [string, number]> = [
    // Before `_slab`, or every double slab reads as half a block and floors become trip hazards.
    ['_double_slab', FULL_BLOCK],
    ['_fence_gate', FENCE_HEIGHT],
    ['_fence', FENCE_HEIGHT],
    ['_wall', FENCE_HEIGHT],
    ['_carpet', 0.0625],
    ['_candle_cake', 0.5]
];

/** Whether a block is one a mob simply walks through, ignoring anything it might stand on. */
const isPassableName = (name: string): boolean =>
    PASSABLE_NAMES.has(name) || PASSABLE_SUFFIXES.some((suffix) => name.endsWith(suffix));

const flag = (value: BlockStateValue | undefined): boolean => value === 1 || value === true || value === 'true';

/**
 * How high a mob standing in this block's cell would be held up, in blocks.
 *
 * The shape depends on the state and not only on the name for exactly the blocks you would expect:
 * which half a slab fills, how deep the snow is, whether the gate is open.
 * @param {string} name - The block's state name.
 * @param {Readonly<Record<string, BlockStateValue>>} [properties] - Its state properties.
 * @returns {number} `0` for something walked through, up to {@link FENCE_HEIGHT} for a fence.
 */
export const collisionTopOf = (name: string, properties: Readonly<Record<string, BlockStateValue>> = {}): number => {
    // A trapdoor ends in `_door`, so it has to be answered before the passable families are
    // consulted or every trapdoor in the world becomes a hole.
    if (name.endsWith('_trapdoor')) {
        // Open, it is a wall rather than a floor; shut and upside down it fills the top of the
        // cell, which - like a top slab - is nothing a mob can be underneath anyway.
        if (flag(properties['open_bit']) || flag(properties['upside_down_bit'])) return FULL_BLOCK;
        return 0.1875;
    }

    if (name.endsWith('_double_slab')) return FULL_BLOCK;

    if (name.endsWith('_slab')) {
        // A top slab fills [0.5, 1] rather than [0, 0.5]. One number per block cannot say that, so
        // it is taken as a full cube: a mob cannot stand on the floor under a top slab either way,
        // since half a block of headroom is not enough for anything.
        return properties['minecraft:vertical_half'] === 'top' ? FULL_BLOCK : 0.5;
    }

    // Two boxes in vanilla - the back is a full block, the front a half - and taken here as the
    // half, because that is the part a mob meets and the height it has to get its feet over.
    if (name.endsWith('_stairs')) return 0.5;

    if (name === 'minecraft:fence_gate' || name.endsWith('_fence_gate')) {
        return flag(properties['open_bit']) ? PASSABLE : FENCE_HEIGHT;
    }

    // Eight layers, each an eighth of a block, and the first of them has no collision at all -
    // which is why a dusting of snow does not trip anything up.
    if (name === 'minecraft:snow_layer') return (Number(properties['height'] ?? 0) || 0) / 8;

    const fixed = FIXED_TOPS.get(name);
    if (fixed !== undefined) return fixed;

    for (const [suffix, top] of SUFFIX_TOPS) {
        if (name.endsWith(suffix)) return top;
    }

    if (isPassableName(name)) return PASSABLE;

    return FULL_BLOCK;
};

export default collisionTopOf;
