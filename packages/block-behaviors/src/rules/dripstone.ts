/**
 * Pointed dripstone and the blocks shaped like it, Java's `SpeleothemBlock`.
 *
 * Bedrock spells Java's `tip_direction` as `hanging` (true for a stalactite, whose tip points
 * down) and Java's `tip_merge` thickness as `merge`. Each segment of a column takes its
 * thickness from the segments in front of and behind it, so a column reads base, middle,
 * frustum, tip from the block it grows out of to its point.
 */
import type { HookBlock } from '@jsprismarine/blocks';

import { offset } from '../geometry';
import { AIR } from '../identifiers';
import { hasState, stateBoolean, stateString } from '../state';
import type { WorldActions } from '../world';
import { isSolidSupport } from './support';

/** The state Bedrock keeps a segment's thickness in. */
export const DRIPSTONE_THICKNESS = 'dripstone_thickness';

/** Which way a segment's tip points. */
export type TipDirection = 'up' | 'down';

/** Bedrock's thickness values, Java's `DripstoneThickness` with `tip_merge` spelled `merge`. */
export type DripstoneThickness = 'tip' | 'merge' | 'frustum' | 'middle' | 'base';

/** Whether a block is a segment of a column, which is what having a thickness means. */
export const isDripstone = (block: HookBlock | undefined): block is HookBlock =>
    block !== undefined && hasState(block, DRIPSTONE_THICKNESS);

/** The way a segment's tip points. */
export const tipDirectionOf = (block: HookBlock): TipDirection => (stateBoolean(block, 'hanging') ? 'down' : 'up');

const reverse = (direction: TipDirection): TipDirection => (direction === 'up' ? 'down' : 'up');

/**
 * Whether a block is a segment, of any kind, pointing a given way. Java asks the
 * `#minecraft:speleothems` tag, which holds the blocks that have a thickness.
 *
 * @javaSource SpeleothemBlock.isSpeleothemWithDirection
 */
const isSegmentPointing = (block: HookBlock | undefined, direction: TipDirection): block is HookBlock =>
    isDripstone(block) && tipDirectionOf(block) === direction;

/** Whether a block is a segment of one kind pointing a given way. */
const isSameSegmentPointing = (
    block: HookBlock | undefined,
    kind: string,
    direction: TipDirection
): block is HookBlock => isSegmentPointing(block, direction) && block.identifier === kind;

/**
 * Whether a segment pointing `tip` can stay at a position: the block behind its base holds it, or
 * is another segment of its kind pointing the same way.
 *
 * @javaSource SpeleothemBlock.isValidSpeleothemPlacement
 */
export const canDripstoneSurvive = (world: WorldActions, block: HookBlock, tip: TipDirection): boolean => {
    const behind = offset(block.position, reverse(tip));
    return isSolidSupport(world, behind) || isSameSegmentPointing(world.getBlock(behind), block.identifier, tip);
};

/**
 * The way a new segment points: the way the placer is not looking, or the other way when only
 * that one has support.
 *
 * @param looking - The vertical direction the placer looks nearest to.
 * @returns Undefined when neither way has support, which refuses the placement.
 * @javaSource SpeleothemBlock.calculateTipDirection
 */
export const placedTipDirection = (
    world: WorldActions,
    block: HookBlock,
    looking: TipDirection
): TipDirection | undefined => {
    const preferred = reverse(looking);
    if (canDripstoneSurvive(world, block, preferred)) return preferred;
    const other = reverse(preferred);
    return canDripstoneSurvive(world, block, other) ? other : undefined;
};

/**
 * A segment's thickness from its neighbors along the column.
 *
 * A segment whose tip meets an opposing tip merges with it. One with a segment in front of it
 * that is itself a tip is the frustum behind that tip, and one further back is the middle,
 * or the base when nothing of the column is behind it.
 *
 * @param mergeOpposingTips - Whether a tip meeting an opposing tip merges, which Java turns off
 *   for a sneaking placer and keeps for a segment that is already merged.
 * @javaSource SpeleothemBlock.calculateSpeleothemThickness
 */
export const dripstoneThickness = (
    world: WorldActions,
    block: HookBlock,
    tip: TipDirection,
    mergeOpposingTips: boolean
): DripstoneThickness => {
    const base = reverse(tip);
    const inFront = world.getBlock(offset(block.position, tip));
    if (isSameSegmentPointing(inFront, block.identifier, base)) {
        return !mergeOpposingTips && stateString(inFront, DRIPSTONE_THICKNESS) !== 'merge' ? 'tip' : 'merge';
    }
    if (!isSegmentPointing(inFront, tip)) return 'tip';

    const inFrontThickness = stateString(inFront, DRIPSTONE_THICKNESS);
    if (inFrontThickness === 'tip' || inFrontThickness === 'merge') return 'frustum';
    const behind = world.getBlock(offset(block.position, base));
    return isSegmentPointing(behind, tip) ? 'middle' : 'base';
};

/** The entity a falling block becomes, Java's `FallingBlockEntity`. */
export const FALLING_BLOCK = 'minecraft:falling_block';

/** The most a falling stalactite's tip hurts, Java's `setHurtsEntities(damage, 40)`. */
export const STALACTITE_MAX_DAMAGE = 40;

/** The fewest blocks Java counts a falling column as when it sizes the tip's damage. */
const STALACTITE_MIN_SIZE = 6;

/**
 * Brings down a stalactite that lost what held it, with every segment hanging from it down to
 * its tip, each as a falling block entity.
 *
 * Each entity carries the segment's states and says it breaks into its item where it lands,
 * since a falling stalactite has nothing above it to hang from there. The tip also hurts what
 * it lands in, by the column's length (at least six) for each block fallen, up to
 * {@link STALACTITE_MAX_DAMAGE}. A segment that still has its support stays put, since the
 * tick may be stale.
 *
 * @returns The number of segments that fell.
 * @javaSource SpeleothemBlock.spawnFallingStalactite
 */
export const fallStalactite = (world: WorldActions, block: HookBlock): number => {
    if (tipDirectionOf(block) !== 'down' || canDripstoneSurvive(world, block, 'down')) return 0;

    const fallen: HookBlock[] = [];
    let segment: HookBlock | undefined = block;
    while (isSegmentPointing(segment, 'down')) {
        const thickness = stateString(segment, DRIPSTONE_THICKNESS);
        const tip = thickness === 'tip' || thickness === 'merge';
        const size = Math.max(1 + block.position.y - segment.position.y, STALACTITE_MIN_SIZE);
        // Java's `FallingBlockEntity.fall` takes the block out and spawns the entity in the
        // middle of its cell; the neighbors hear about it once the whole column is out.
        world.setBlock(segment.position, AIR, undefined, false);
        const { x, y, z } = segment.position;
        world.spawnEntity({ x: x + 0.5, y, z: z + 0.5 }, FALLING_BLOCK, {
            block: segment.identifier,
            states: segment.states,
            breaks_on_landing: true,
            ...(tip ? { hurts: { per_block: size, max: STALACTITE_MAX_DAMAGE, cause: 'stalactite' } } : {})
        });
        fallen.push(segment);
        if (tip) break;
        segment = world.getBlock(offset(segment.position, 'down'));
    }
    for (const gone of fallen) world.notifyNeighbors(gone.position);
    return fallen.length;
};
