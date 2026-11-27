/**
 * Shared per-block facts used by signal calculations, random tick selection,
 * explosions, and block queries.
 *
 * Published block properties come from `@jsprismarine/mapping`, whose table
 * is dumped from the Java 26.3 jar. Resolved block components supply explicit
 * redstone-conductor overrides; absent one, the Java default is derived from
 * the block's full-cube shape.
 */

import { bedrockBlockPropertiesOf, bedrockBlockSupportOf } from '@jsprismarine/mapping';
import type { BlockSupportFace, SupportType } from '@jsprismarine/mapping';

import type { BlockRef } from './world';
import { AIR } from './world';

/** Whether the position holds nothing. */
export const isAir = (block: BlockRef): boolean => block.name === AIR.name;

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
 * `BlockBehaviour.Properties` defaults it to `isCollisionShapeFullBlock`.
 * Explicit component values from the resolved block definition override that
 * default, including the vanilla exceptions written into the generated overlay.
 */
export const isRedstoneConductor = (block: BlockRef): boolean => block.redstoneConductor ?? isFullCube(block);

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

/**
 * Java's legacy `BlockStateBase.isSolid`: on for a block that forces it, otherwise whether the
 * collision shape's bounds fill most of the cell or its full height, so soul sand, a cactus, a
 * slab and a cobweb are solid where a nether portal block is not. Read from the mapping table's
 * support facts, which Java's own code computed; a block with no Java source answers by
 * {@link isFullCube}.
 *
 * @javaSee BlockBehaviour$BlockStateBase.isSolid
 */
export const isSolid = (block: BlockRef): boolean =>
    bedrockBlockSupportOf(block.name, block.states)?.solid ?? isFullCube(block);

/**
 * Java's `BlockStateBase.isFaceSturdy`: whether a face of the block holds what a support type
 * needs, a whole face (`full`), a post in its middle (`center`) or its rim (`rigid`). Read from the
 * mapping table's support facts; a block with no Java source answers by {@link hasSturdyTopFace}
 * for its top and by {@link isFullCube} for any other face.
 *
 * @param face - The face of this block, such as `up` for what stands on it.
 * @param type - What the face has to hold, `full` when left out.
 * @javaSee BlockBehaviour$BlockStateBase.isFaceSturdy(Lnet/minecraft/world/level/BlockGetter;Lnet/minecraft/core/BlockPos;Lnet/minecraft/core/Direction;Lnet/minecraft/world/level/block/SupportType;)Z
 */
export const isFaceSturdy = (block: BlockRef, face: BlockSupportFace, type: SupportType = 'full'): boolean =>
    bedrockBlockSupportOf(block.name, block.states)?.isFaceSturdy(face, type) ??
    (face === 'up' ? hasSturdyTopFace(block) : isFullCube(block));
