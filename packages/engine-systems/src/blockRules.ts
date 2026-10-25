/**
 * The per-block facts the four systems read: push reaction, flammability,
 * hardness and redstone conductivity.
 *
 * Everything with a published source comes from `@jsprismarine/mapping`, whose
 * table is dumped from the Java 26.3 jar. Nothing here restates a number that
 * table already holds. Conductivity has no published source in either edition,
 * so this module derives it; {@link isRedstoneConductor} documents how.
 */

import { bedrockBlockPropertiesOf } from '@jsprismarine/mapping';

import type { BlockRef } from './world';
import { AIR } from './world';

/** Java's `PushReaction`, as the mapping table spells it. */
export const PUSH_REACTIONS = ['push_pull', 'push', 'popped', 'immoveable', 'ignore'] as const;

/** One of {@link PUSH_REACTIONS}. */
export type PushReaction = (typeof PUSH_REACTIONS)[number];

const isPushReaction = (value: string): value is PushReaction => (PUSH_REACTIONS as readonly string[]).includes(value);

/** Whether the position holds nothing. */
export const isAir = (block: BlockRef): boolean => block.name === AIR.name;

/**
 * How a piston treats the block, taken from the mapping table's `pushReaction`.
 *
 * Unknown blocks answer `push_pull`, which is Java's `PushReaction.NORMAL`
 * default in `BlockBehaviour.Properties`.
 */
export const pushReactionOf = (block: BlockRef): PushReaction => {
    const value = bedrockBlockPropertiesOf(block.name, block.states)?.pushReaction;
    return value !== undefined && isPushReaction(value) ? value : 'push_pull';
};

/**
 * The block's destroy time. `-1` marks the unbreakable blocks, which
 * `PistonBaseBlock.isPushable` refuses to move before it even reads the push
 * reaction, and which is why bedrock does not move despite a normal reaction.
 */
export const hardnessOf = (block: BlockRef): number =>
    bedrockBlockPropertiesOf(block.name, block.states)?.hardness ?? 0;

/** Fire's odds of catching this block alight, `FireBlock`'s `igniteOdds`. */
export const igniteOddsOf = (block: BlockRef): number =>
    bedrockBlockPropertiesOf(block.name, block.states)?.igniteOdds ?? 0;

/** Fire's odds of consuming this block, `FireBlock`'s `burnOdds`. */
export const burnOddsOf = (block: BlockRef): number =>
    bedrockBlockPropertiesOf(block.name, block.states)?.burnOdds ?? 0;

/** Whether the block receives random ticks, which the random tick driver filters on. */
export const isRandomlyTicking = (block: BlockRef): boolean =>
    bedrockBlockPropertiesOf(block.name, block.states)?.randomTick ?? false;

/** How much light the block swallows; 15 marks a fully opaque cube. */
const lightDampeningOf = (block: BlockRef): number =>
    bedrockBlockPropertiesOf(block.name, block.states)?.lightDampening ?? 0;

/**
 * Full cubes whose light dampening is below 15, so the opacity test alone
 * would miss them. Each is a block whose collision shape is a whole cube while
 * light passes through it.
 */
const TRANSPARENT_FULL_CUBES: ReadonlySet<string> = new Set([
    'minecraft:barrier',
    'minecraft:beacon',
    'minecraft:frosted_ice',
    'minecraft:glass',
    'minecraft:hardened_glass',
    'minecraft:honey_block',
    'minecraft:ice',
    'minecraft:powder_snow',
    'minecraft:slime',
    'minecraft:undyed_shulker_box'
]);

/**
 * The blocks whose Java registration calls `isRedstoneConductor(Blocks::never)`,
 * read out of `Blocks` in the 26.3 jar and written with their Bedrock names.
 *
 * Every one is a full cube that carries no redstone: this is why a redstone
 * block next to dust does not power the dust through itself, and why glowstone
 * and a sea lantern are not conductors despite being solid and opaque.
 */
export const NON_CONDUCTING_FULL_CUBES: ReadonlySet<string> = new Set([
    'minecraft:bamboo',
    'minecraft:beacon',
    'minecraft:chorus_flower',
    'minecraft:frosted_ice',
    'minecraft:glass',
    'minecraft:glowstone',
    'minecraft:ice',
    'minecraft:moving_block',
    'minecraft:observer',
    'minecraft:pointed_dripstone',
    'minecraft:powder_snow',
    'minecraft:powered_repeater',
    'minecraft:redstone_block',
    'minecraft:scaffolding',
    'minecraft:sea_lantern',
    'minecraft:tinted_glass',
    'minecraft:tnt',
    'minecraft:unpowered_repeater'
]);

/**
 * The blocks whose Java registration calls `isRedstoneConductor(Blocks::always)`,
 * read out of the same place: soul sand and mud conduct although neither is a
 * full cube.
 */
export const ALWAYS_CONDUCTING: ReadonlySet<string> = new Set(['minecraft:mud', 'minecraft:soul_sand']);

/**
 * Whether the block's collision shape fills its cube, which is what Java's
 * `isCollisionShapeFullBlock` answers.
 *
 * Neither edition publishes collision shapes, so this reads the mapping table's
 * light dampening, which is 15 for every opaque cube and 0 or 1 for the slabs,
 * stairs, fences and plates that are not cubes, and adds the handful of
 * transparent cubes by name. It is the one input in this package with no
 * published source; the README lists it as such.
 */
export const isFullCube = (block: BlockRef): boolean =>
    !isAir(block) && (lightDampeningOf(block) === 15 || TRANSPARENT_FULL_CUBES.has(block.name));

/**
 * Java's `isRedstoneConductor`: whether the block carries redstone power into
 * itself and passes it to its neighbors.
 *
 * `BlockBehaviour.Properties` defaults it to `isCollisionShapeFullBlock`, and
 * 26 blocks override it. The overrides are listed in
 * {@link NON_CONDUCTING_FULL_CUBES} and {@link ALWAYS_CONDUCTING}.
 */
export const isRedstoneConductor = (block: BlockRef): boolean => {
    if (ALWAYS_CONDUCTING.has(block.name)) return true;
    if (NON_CONDUCTING_FULL_CUBES.has(block.name)) return false;
    return isFullCube(block);
};

/**
 * Java's `isFaceSturdy(…, Direction.UP)`: whether something can be placed on
 * top of the block. Wire, repeaters and comparators all break without it.
 *
 * Slabs and stairs have sturdy top faces in Java depending on their half, which
 * this does not model: it answers from the full-cube test plus the top slab and
 * upside-down stair states.
 */
export const hasSturdyTopFace = (block: BlockRef): boolean => {
    if (isFullCube(block)) return true;
    const half = block.states['minecraft:vertical_half'] ?? block.states['top_slot_bit'];
    if (half === 'top' || half === true || half === 1) return true;
    return block.states['upside_down_bit'] === true || block.states['upside_down_bit'] === 1;
};
