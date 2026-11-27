/**
 * Standing on something, and what happens when that something goes.
 *
 * Whether a block can hold another one up is a solidity question, and the
 * overlay publishes no solidity column yet. The nearest fact it does publish
 * is `push_reaction`: the blocks a piston destroys rather than moves are the
 * ones a torch cannot hang on. So solidity reads as "not air, not a liquid,
 * not a block a piston pops", which is data-driven and right for every case
 * a family asks about.
 */
import type { BlockFace, BlockPosition, HookBlock } from '@jsprismarine/blocks';
import type { SupportType } from '@jsprismarine/mapping';

import { CARDINAL_DIRECTIONS, offset, opposite } from '../geometry';
import { stateNumber, stateString } from '../state';
import { AIR, isLiquid, isReplaceable } from '../identifiers';
import type { ItemDrop, WorldActions } from '../world';

/** Whether a block at a position can hold another block up. */
export const isSolidSupport = (world: WorldActions, position: BlockPosition): boolean => {
    const block = world.getBlock(position);
    if (block === undefined) return false;
    if (isReplaceable(block.identifier) || isLiquid(block.identifier)) return false;
    return world.propertiesOf(block.identifier).pushReaction !== 'popped';
};

/**
 * Whether the block at a position is solid by Java's legacy flag, `BlockStateBase.isSolid`, which
 * a sign, a banner and a portal's floor ask for: a block that forces it on, or one whose collision
 * shape fills most of the cell or its full height, so a cobweb or a slab is solid where a nether
 * portal block is not. A host without {@link WorldActions.isSolid} answers by
 * {@link isSolidSupport}.
 *
 * @javaSee BlockBehaviour$BlockStateBase.isSolid
 */
export const isSolidAt = (world: WorldActions, position: BlockPosition): boolean => {
    const block = world.getBlock(position);
    if (block === undefined) return false;
    return world.isSolid?.(block) ?? isSolidSupport(world, position);
};

/**
 * What a block asks of the block it hangs on, sits on or leans on, by its Java survival rule:
 * the legacy solid flag (`solid`, a sign or a banner), or a sturdy face of one support type.
 */
export type AttachmentNeed = 'solid' | SupportType;

/**
 * Whether one face of the block at a position is sturdy for a support type, Java's
 * `BlockStateBase.isFaceSturdy`. A host without {@link WorldActions.isFaceSturdy} answers a top face
 * by {@link WorldActions.hasSturdyTopFace} and a bottom face by {@link WorldActions.isFullCube},
 * each on top of {@link isSolidSupport}, and any face it cannot answer by {@link isSolidSupport}.
 *
 * @param face - The face of the block at `position`, such as `up` for what stands on it.
 * @javaSee BlockBehaviour$BlockStateBase.isFaceSturdy(Lnet/minecraft/world/level/BlockGetter;Lnet/minecraft/core/BlockPos;Lnet/minecraft/core/Direction;Lnet/minecraft/world/level/block/SupportType;)Z
 */
export const isFaceSturdyAt = (
    world: WorldActions,
    position: BlockPosition,
    face: BlockFace,
    type: SupportType = 'full'
): boolean => {
    const block = world.getBlock(position);
    if (block === undefined) return false;
    const sturdy = world.isFaceSturdy?.(block, face, type);
    if (sturdy !== undefined) return sturdy;
    const shaped =
        face === 'up' ? world.hasSturdyTopFace?.(block) : face === 'down' ? world.isFullCube?.(block) : undefined;
    return (shaped ?? true) && isSolidSupport(world, position);
};

/**
 * Whether the block across one face of a position holds a block there that needs `needs`: Java's
 * solid flag for `solid`, otherwise the face of that block turned toward the position being
 * sturdy for the support type, as `FaceAttachedHorizontalDirectionalBlock.canAttach` and
 * `Block.canSupportCenter` ask.
 *
 * @param toward - The side of `position` the holding block is on, `down` for the ground.
 * @javaSource FaceAttachedHorizontalDirectionalBlock.canAttach
 * @javaSource Block.canSupportCenter
 * @javaVerified vectors
 */
export const isAttachedToward = (
    world: WorldActions,
    position: BlockPosition,
    toward: BlockFace,
    needs: AttachmentNeed
): boolean => {
    const holder = offset(position, toward);
    return needs === 'solid' ? isSolidAt(world, holder) : isFaceSturdyAt(world, holder, opposite(toward), needs);
};

/**
 * Breaks a block whose Java survival rule no longer holds: the block it attaches to across
 * `toward` stopped giving it what {@link AttachmentNeed} it has.
 *
 * @returns True when the block popped.
 */
export const popWithoutAttachment = (
    world: WorldActions,
    block: HookBlock,
    toward: BlockFace,
    needs: AttachmentNeed
): boolean => {
    if (isAttachedToward(world, block.position, toward, needs)) return false;
    popBlock(world, block);
    return true;
};

/** Removes a block, drops what it leaves behind and tells its neighbors. */
export const breakBlock = (
    world: WorldActions,
    block: HookBlock,
    drops: readonly ItemDrop[] = [],
    notifyNeighbors = true
): void => {
    world.setBlock(block.position, AIR, undefined, false);
    for (const drop of drops) world.dropItem(block.position, drop);
    if (notifyNeighbors) world.notifyNeighbors(block.position);
};

/**
 * Removes a block the way the world does it, which is what losing support, a piston and a
 * falling anvil all do to the block in the way.
 *
 * The drop is Java's table for the block, rolled by the world through
 * {@link WorldActions.destroyBlock}. One of the block itself is only the stand-in for a
 * world that has no table to roll, and it is a guess: deepslate yields cobbled deepslate
 * and a popped crop yields its seeds, neither of which is one of itself.
 */
export const popBlock = (world: WorldActions, block: HookBlock, notifyNeighbors = true): void => {
    const rolled = world.destroyBlock?.(block.position) ?? false;
    breakBlock(world, block, rolled ? [] : [{ identifier: block.identifier, count: 1 }], notifyNeighbors);
};

/**
 * Breaks a block that lost the face it was attached to.
 *
 * @param face - Where the support is, `down` for a block standing on another.
 * @returns True when the block popped.
 */
export const popWithoutSupport = (
    world: WorldActions,
    block: HookBlock,
    face: BlockFace = 'down',
    notifyNeighbors = true
): boolean => {
    if (isSolidSupport(world, offset(block.position, face))) return false;
    popBlock(world, block, notifyNeighbors);
    return true;
};

/**
 * Breaks a block unless the block it stands on is ground it accepts.
 *
 * @param names - Bare names, such as `farmland`, that the block accepts below it. Read only
 *   when no `tag` is given or the host answers no tags, which is what makes them a fallback.
 * @param tag - The Java tag the ground belongs to, such as `minecraft:supports_crops`, which
 *   is the rule itself wherever the host can resolve one.
 * @returns True when the block popped.
 */
export const popWithoutGround = (
    world: WorldActions,
    block: HookBlock,
    names: ReadonlySet<string>,
    tag?: string
): boolean => {
    const below = world.getBlock(offset(block.position, 'down'));
    const supported =
        below !== undefined &&
        (tag === undefined
            ? names.has(below.identifier.replace(/^[^:]*:/, ''))
            : (world.hasBlockTag?.(below, tag) ?? names.has(below.identifier.replace(/^[^:]*:/, ''))));
    if (supported) return false;
    popBlock(world, block);
    return true;
};

/**
 * The face a block with an `attachment` state hangs on: below a standing block, above a hanging
 * one, and the wall behind one on a side, whose `direction` names the way it faces in cardinal
 * order. Undefined for an attachment this does not read, such as a bell between two walls.
 * @param sideHasWall - Whether a `side` attachment reads its wall from `direction`, which a
 *   grindstone's does and a bell's, with its own direction order, does not.
 */
export const attachmentFaceOf = (block: HookBlock, sideHasWall: boolean): BlockFace | undefined => {
    switch (stateString(block, 'attachment', 'standing')) {
        case 'standing':
            return 'down';
        case 'hanging':
            return 'up';
        case 'side': {
            if (!sideHasWall) return undefined;
            const facing = CARDINAL_DIRECTIONS[stateNumber(block, 'direction')];
            return facing === undefined ? undefined : opposite(facing);
        }
        default:
            return undefined;
    }
};

/** One face a block can cover, and the bit its direction state sets for it. */
export type FaceBit = { readonly face: BlockFace; readonly bit: number };

/** The state Bedrock packs a lichen's, a vein's or a resin clump's faces into. */
export const MULTI_FACE_STATE = 'multi_face_direction_bits';

/** The six faces Bedrock packs into {@link MULTI_FACE_STATE}. */
const MULTI_FACE_BITS = [
    { face: 'down', bit: 1 },
    { face: 'up', bit: 2 },
    { face: 'north', bit: 4 },
    { face: 'south', bit: 8 },
    { face: 'west', bit: 16 },
    { face: 'east', bit: 32 }
] as const satisfies readonly FaceBit[];

/** Whether one of a block's flagged faces still touches a supporting block. */
export const hasSupportedAttachment = (
    world: WorldActions,
    block: HookBlock,
    state: string,
    faces: readonly FaceBit[]
): boolean => {
    const bits = stateNumber(block, state);
    return faces.some(({ face, bit }) => (bits & bit) !== 0 && isSolidSupport(world, offset(block.position, face)));
};

/**
 * Breaks a multiface block, Java's `MultifaceBlock` (glow lichen, a sculk vein, a resin clump),
 * once the neighbor that changed was on one of its faces and no face it covers is held any more.
 *
 * @param changed - The face whose neighbor changed.
 * @returns True when the block popped.
 */
export const popUnsupportedMultiface = (world: WorldActions, block: HookBlock, changed: BlockFace): boolean => {
    const bit = MULTI_FACE_BITS.find(({ face }) => face === changed)?.bit;
    if (bit === undefined || (stateNumber(block, MULTI_FACE_STATE) & bit) === 0) return false;
    if (hasSupportedAttachment(world, block, MULTI_FACE_STATE, MULTI_FACE_BITS)) return false;
    popBlock(world, block);
    return true;
};
