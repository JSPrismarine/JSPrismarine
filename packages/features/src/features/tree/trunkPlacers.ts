/** Java's trunk placers, from `straight_trunk_placer` to `cherry_trunk_placer`. */

import { randomBetweenInclusive } from '../../placement/WorldgenRandom';
import type { IntProvider } from '../../providers/valueProviders';
import type { BlockSet } from '../../registry';
import type { BlockState, Direction } from '../../world/BlockState';
import { ALL_DIRECTIONS, DIRECTION_STEPS, oppositeDirection, withProperty } from '../../world/BlockState';
import type { BlockPos } from '../../world/FeatureWorld';
import { offset } from '../../world/FeatureWorld';
import { above, below, inBlockSet, mthCos, mthSin, relative, shuffledCopy } from '../support';

import type { FoliageAttachment, TreeContext, TrunkPlacer } from './shared';
import {
    LOGS_TAG,
    attachment,
    f32,
    isAirOrLeaves,
    placeBelowTrunkBlock,
    placeLog,
    randomHorizontal,
    sidewaysAxis,
    validTreePos
} from './shared';

const trunkBase = (
    type: string,
    baseHeight: number,
    heightRandA: number,
    heightRandB: number,
    place: TrunkPlacer['place'],
    canGrowThrough?: BlockSet
): TrunkPlacer => ({
    type,
    treeHeight: (random) =>
        baseHeight + random.nextIntBounded(heightRandA + 1) + random.nextIntBounded(heightRandB + 1),
    place,
    isFree: (world, position) => {
        if (validTreePos(world, position)) return true;
        const state = world.getBlock(position);
        if (canGrowThrough !== undefined && inBlockSet(world.blocks, state, canGrowThrough)) return true;
        return world.blocks.hasTag(state, LOGS_TAG);
    }
});

// --- Trunk placers -------------------------------------------------------------------------

/** Java's `StraightTrunkPlacer`. */
export const straightTrunkPlacer = (base: number, randA: number, randB: number): TrunkPlacer =>
    trunkBase('straight_trunk_placer', base, randA, randB, (context, treeHeight, origin) => {
        placeBelowTrunkBlock(context, below(origin));
        for (let y = 0; y < treeHeight; y++) placeLog(context, above(origin, y));
        return [attachment(above(origin, treeHeight), 0, false)];
    });

/** Java's `ForkingTrunkPlacer`. */
export const forkingTrunkPlacer = (base: number, randA: number, randB: number): TrunkPlacer =>
    trunkBase('forking_trunk_placer', base, randA, randB, (context, treeHeight, origin) => {
        placeBelowTrunkBlock(context, below(origin));
        const attachments: FoliageAttachment[] = [];
        const leanDirection = randomHorizontal(context.random);
        const leanHeight = treeHeight - context.random.nextIntBounded(4) - 1;
        let leanSteps = 3 - context.random.nextIntBounded(3);

        let x = origin.x;
        let z = origin.z;
        let endY: number | undefined;
        for (let step = 0; step < treeHeight; step++) {
            const y = origin.y + step;
            if (step >= leanHeight && leanSteps > 0) {
                x += DIRECTION_STEPS[leanDirection][0];
                z += DIRECTION_STEPS[leanDirection][2];
                leanSteps--;
            }
            if (placeLog(context, { x, y, z })) endY = y + 1;
        }
        if (endY !== undefined) attachments.push(attachment({ x, y: endY, z }, 1, false));

        x = origin.x;
        z = origin.z;
        const branchDirection = randomHorizontal(context.random);
        if (branchDirection !== leanDirection) {
            const branchStart = leanHeight - context.random.nextIntBounded(2) - 1;
            let branchSteps = 1 + context.random.nextIntBounded(3);
            endY = undefined;
            for (let step = branchStart; step < treeHeight && branchSteps > 0; branchSteps--, step++) {
                if (step < 1) continue;
                const y = origin.y + step;
                x += DIRECTION_STEPS[branchDirection][0];
                z += DIRECTION_STEPS[branchDirection][2];
                if (placeLog(context, { x, y, z })) endY = y + 1;
            }
            if (endY !== undefined) attachments.push(attachment({ x, y: endY, z }, 0, false));
        }
        return attachments;
    });

/** Java's `GiantTrunkPlacer`. */
export const giantTrunkPlacer = (
    base: number,
    randA: number,
    randB: number,
    type = 'giant_trunk_placer'
): TrunkPlacer =>
    trunkBase(type, base, randA, randB, (context, treeHeight, origin) => {
        const under = below(origin);
        placeBelowTrunkBlock(context, under);
        placeBelowTrunkBlock(context, offset(under, 1, 0, 0));
        placeBelowTrunkBlock(context, offset(under, 0, 0, 1));
        placeBelowTrunkBlock(context, offset(under, 1, 0, 1));

        const placeIfFree = (position: BlockPos) => {
            if (context.config.trunkPlacer.isFree(context.world, position)) placeLog(context, position);
        };
        for (let y = 0; y < treeHeight; y++) {
            placeIfFree(offset(origin, 0, y, 0));
            if (y >= treeHeight - 1) continue;
            placeIfFree(offset(origin, 1, y, 0));
            placeIfFree(offset(origin, 1, y, 1));
            placeIfFree(offset(origin, 0, y, 1));
        }
        return [attachment(above(origin, treeHeight), 0, true)];
    });

/** Java's `MegaJungleTrunkPlacer`. */
export const megaJungleTrunkPlacer = (base: number, randA: number, randB: number): TrunkPlacer => {
    const giant = giantTrunkPlacer(base, randA, randB, 'mega_jungle_trunk_placer');
    return {
        ...giant,
        place: (context, treeHeight, origin) => {
            const attachments = giant.place(context, treeHeight, origin);
            for (
                let branchHeight = treeHeight - 2 - context.random.nextIntBounded(4);
                branchHeight > treeHeight / 2;
                branchHeight -= 2 + context.random.nextIntBounded(4)
            ) {
                const angle = f32(context.random.nextFloat() * f32(Math.PI * 2));
                let bx = 0;
                let bz = 0;
                for (let step = 0; step < 5; step++) {
                    bx = Math.trunc(f32(1.5 + mthCos(angle) * step));
                    bz = Math.trunc(f32(1.5 + mthSin(angle) * step));
                    placeLog(context, offset(origin, bx, branchHeight - 3 + Math.trunc(step / 2), bz));
                }
                attachments.push(attachment(offset(origin, bx, branchHeight, bz), -2, false));
            }
            return attachments;
        }
    };
};

/** Java's `DarkOakTrunkPlacer`. */
export const darkOakTrunkPlacer = (base: number, randA: number, randB: number): TrunkPlacer =>
    trunkBase('dark_oak_trunk_placer', base, randA, randB, (context, treeHeight, origin) => {
        const attachments: FoliageAttachment[] = [];
        const under = below(origin);
        placeBelowTrunkBlock(context, under);
        placeBelowTrunkBlock(context, offset(under, 1, 0, 0));
        placeBelowTrunkBlock(context, offset(under, 0, 0, 1));
        placeBelowTrunkBlock(context, offset(under, 1, 0, 1));

        const leanDirection = randomHorizontal(context.random);
        const leanHeight = treeHeight - context.random.nextIntBounded(4);
        let leanSteps = 2 - context.random.nextIntBounded(3);
        let tx = origin.x;
        let tz = origin.z;
        const topY = origin.y + treeHeight - 1;

        for (let dy = 0; dy < treeHeight; dy++) {
            if (dy >= leanHeight && leanSteps > 0) {
                tx += DIRECTION_STEPS[leanDirection][0];
                tz += DIRECTION_STEPS[leanDirection][2];
                leanSteps--;
            }
            const position = { x: tx, y: origin.y + dy, z: tz };
            if (!isAirOrLeaves(context.world, position)) continue;
            placeLog(context, position);
            placeLog(context, offset(position, 1, 0, 0));
            placeLog(context, offset(position, 0, 0, 1));
            placeLog(context, offset(position, 1, 0, 1));
        }
        attachments.push(attachment({ x: tx, y: topY, z: tz }, 0, true));

        for (let ox = -1; ox <= 2; ox++) {
            for (let oz = -1; oz <= 2; oz++) {
                const outsideTrunk = ox < 0 || ox > 1 || oz < 0 || oz > 1;
                if (!outsideTrunk || context.random.nextIntBounded(3) > 0) continue;
                const length = context.random.nextIntBounded(3) + 2;
                for (let branchY = 0; branchY < length; branchY++) {
                    placeLog(context, { x: origin.x + ox, y: topY - branchY - 1, z: origin.z + oz });
                }
                attachments.push(attachment({ x: origin.x + ox, y: topY, z: origin.z + oz }, 0, false));
            }
        }
        return attachments;
    });

/** Java's `BendingTrunkPlacer`. */
export const bendingTrunkPlacer = (
    base: number,
    randA: number,
    randB: number,
    minHeightForLeaves: number,
    bendLength: IntProvider
): TrunkPlacer =>
    trunkBase('bending_trunk_placer', base, randA, randB, (context, treeHeight, origin) => {
        const direction = randomHorizontal(context.random);
        const logHeight = treeHeight - 1;
        let position = origin;
        placeBelowTrunkBlock(context, below(position));
        const attachments: FoliageAttachment[] = [];

        for (let step = 0; step <= logHeight; step++) {
            if (step + 1 >= logHeight + context.random.nextIntBounded(2)) position = relative(position, direction);
            if (validTreePos(context.world, position)) placeLog(context, position);
            if (step >= minHeightForLeaves) attachments.push(attachment(position, 0, false));
            position = above(position);
        }

        const bend = bendLength.sample(context.random);
        for (let step = 0; step <= bend; step++) {
            if (validTreePos(context.world, position)) placeLog(context, position);
            attachments.push(attachment(position, 0, false));
            position = relative(position, direction);
        }
        return attachments;
    });

/** Java's `PoplarTrunkPlacer`. */
export const poplarTrunkPlacer = (
    base: number,
    randA: number,
    randB: number,
    trunkHeightAboveBranches: IntProvider,
    branchAmount: IntProvider
): TrunkPlacer =>
    trunkBase('poplar_trunk_placer', base, randA, randB, (context, treeHeight, origin) => {
        placeBelowTrunkBlock(context, below(origin));
        const trunkToBranches = treeHeight - trunkHeightAboveBranches.sample(context.random);

        for (let y = 0; y < treeHeight; y++) {
            placeLog(context, above(origin, y));
            // Java shuffles all six directions and then drops the vertical pair, so the draws
            // happen whether or not a branch is placed at this height.
            const directions = shuffledCopy(ALL_DIRECTIONS, context.random).filter(
                (direction) => direction !== 'up' && direction !== 'down'
            );
            if (trunkToBranches - 1 !== y) continue;
            const branches = branchAmount.sample(context.random);
            for (let branch = 0; branch < branches; branch++) {
                const direction = directions[branch];
                if (direction === undefined) continue;
                placeLog(context, relative(above(origin, y), direction), sidewaysAxis(direction));
            }
        }
        return [attachment(above(origin, trunkToBranches), 0, false)];
    });

/** Java's `UpwardsBranchingTrunkPlacer`. */
export const upwardsBranchingTrunkPlacer = (
    base: number,
    randA: number,
    randB: number,
    extraBranchSteps: IntProvider,
    placeBranchPerLogProbability: number,
    extraBranchLength: IntProvider,
    canGrowThrough: BlockSet
): TrunkPlacer =>
    trunkBase(
        'upwards_branching_trunk_placer',
        base,
        randA,
        randB,
        (context, treeHeight, origin) => {
            const attachments: FoliageAttachment[] = [];
            for (let step = 0; step < treeHeight; step++) {
                const currentY = origin.y + step;
                const placed = placeLog(context, { x: origin.x, y: currentY, z: origin.z });
                if (placed && step < treeHeight - 1 && context.random.nextFloat() < placeBranchPerLogProbability) {
                    const branchDirection = randomHorizontal(context.random);
                    const branchLength = extraBranchLength.sample(context.random);
                    const branchStart = Math.max(0, branchLength - extraBranchLength.sample(context.random) - 1);
                    const branchSteps = extraBranchSteps.sample(context.random);
                    placeBranch(
                        context,
                        treeHeight,
                        attachments,
                        origin,
                        currentY,
                        branchDirection,
                        branchStart,
                        branchSteps
                    );
                }
                if (step === treeHeight - 1) {
                    attachments.push(attachment({ x: origin.x, y: currentY + 1, z: origin.z }, 0, false));
                }
            }
            return attachments;
        },
        canGrowThrough
    );

const placeBranch = (
    context: TreeContext,
    treeHeight: number,
    attachments: FoliageAttachment[],
    origin: BlockPos,
    currentHeight: number,
    branchDirection: Direction,
    branchStart: number,
    branchSteps: number
): void => {
    let heightAlongBranch = currentHeight + branchStart;
    let logX = origin.x;
    let logZ = origin.z;
    let index = branchStart;
    let remaining = branchSteps;

    while (index < treeHeight && remaining > 0) {
        if (index >= 1) {
            const placementHeight = currentHeight + index;
            logX += DIRECTION_STEPS[branchDirection][0];
            logZ += DIRECTION_STEPS[branchDirection][2];
            heightAlongBranch = placementHeight;
            if (placeLog(context, { x: logX, y: placementHeight, z: logZ })) heightAlongBranch = placementHeight + 1;
            attachments.push(attachment({ x: logX, y: placementHeight, z: logZ }, 0, false));
        }
        index++;
        remaining--;
    }

    if (heightAlongBranch - currentHeight > 1) {
        const foliagePos = { x: logX, y: heightAlongBranch, z: logZ };
        attachments.push(attachment(foliagePos, 0, false));
        attachments.push(attachment(below(foliagePos, 2), 0, false));
    }
};

/** Java's `CherryTrunkPlacer`. */
export const cherryTrunkPlacer = (
    base: number,
    randA: number,
    randB: number,
    branchCount: IntProvider,
    branchHorizontalLength: IntProvider,
    branchStartMin: number,
    branchStartMax: number,
    branchEndOffsetFromTop: IntProvider
): TrunkPlacer =>
    trunkBase('cherry_trunk_placer', base, randA, randB, (context, treeHeight, origin) => {
        const { random } = context;
        placeBelowTrunkBlock(context, below(origin));
        const firstBranch = Math.max(
            0,
            treeHeight - 1 + randomBetweenInclusive(random, branchStartMin, branchStartMax)
        );
        let secondBranch = Math.max(
            0,
            treeHeight - 1 + randomBetweenInclusive(random, branchStartMin, branchStartMax - 1)
        );
        if (secondBranch >= firstBranch) secondBranch++;

        const branches = branchCount.sample(random);
        const hasMiddleBranch = branches === 3;
        const hasBothSides = branches >= 2;
        const trunkHeight = hasMiddleBranch
            ? treeHeight
            : hasBothSides
              ? Math.max(firstBranch, secondBranch) + 1
              : firstBranch + 1;

        for (let y = 0; y < trunkHeight; y++) placeLog(context, above(origin, y));

        const attachments: FoliageAttachment[] = [];
        if (hasMiddleBranch) attachments.push(attachment(above(origin, trunkHeight), 0, false));

        const treeDirection = randomHorizontal(random);
        const modifier = sidewaysAxis(treeDirection);
        attachments.push(
            generateCherryBranch(
                context,
                treeHeight,
                origin,
                modifier,
                treeDirection,
                firstBranch,
                firstBranch < trunkHeight - 1,
                branchHorizontalLength,
                branchEndOffsetFromTop
            )
        );
        if (hasBothSides) {
            attachments.push(
                generateCherryBranch(
                    context,
                    treeHeight,
                    origin,
                    sidewaysAxis(oppositeDirection(treeDirection)),
                    oppositeDirection(treeDirection),
                    secondBranch,
                    secondBranch < trunkHeight - 1,
                    branchHorizontalLength,
                    branchEndOffsetFromTop
                )
            );
        }
        return attachments;
    });

const generateCherryBranch = (
    context: TreeContext,
    treeHeight: number,
    origin: BlockPos,
    modifier: (state: BlockState) => BlockState,
    branchDirection: Direction,
    offsetFromOrigin: number,
    middleContinuesUpwards: boolean,
    branchHorizontalLength: IntProvider,
    branchEndOffsetFromTop: IntProvider
): FoliageAttachment => {
    const { random } = context;
    let logPos = above(origin, offsetFromOrigin);
    const branchEndOffset = treeHeight - 1 + branchEndOffsetFromTop.sample(random);
    const extendAway = middleContinuesUpwards || branchEndOffset < offsetFromOrigin;
    const distance = branchHorizontalLength.sample(random) + (extendAway ? 1 : 0);
    const branchEnd = above(relative(origin, branchDirection, distance), branchEndOffset);
    const horizontalSteps = extendAway ? 2 : 1;

    for (let step = 0; step < horizontalSteps; step++) {
        logPos = relative(logPos, branchDirection);
        placeLog(context, logPos, modifier);
    }

    const verticalDirection: Direction = branchEnd.y > logPos.y ? 'up' : 'down';
    for (;;) {
        const remaining =
            Math.abs(logPos.x - branchEnd.x) + Math.abs(logPos.y - branchEnd.y) + Math.abs(logPos.z - branchEnd.z);
        if (remaining === 0) return attachment(above(branchEnd), 0, false);
        const chance = Math.abs(branchEnd.y - logPos.y) / remaining;
        const growVertically = random.nextFloat() < chance;
        logPos = relative(logPos, growVertically ? verticalDirection : branchDirection);
        placeLog(context, logPos, growVertically ? (state) => state : modifier);
    }
};

/** Java's `FancyTrunkPlacer`. */
export const fancyTrunkPlacer = (base: number, randA: number, randB: number): TrunkPlacer =>
    trunkBase('fancy_trunk_placer', base, randA, randB, (context, treeHeight, origin) => {
        const { random } = context;
        const height = treeHeight + 2;
        const trunkHeight = Math.floor(height * 0.618);
        placeBelowTrunkBlock(context, below(origin));
        // Java's `Math.min(1, ...)` here reads as a bug for `max`, and it means exactly one
        // cluster per layer at every tree size. Reproduced because the shape depends on it.
        const clustersPerY = Math.min(1, Math.floor(1.382 + (height / 13) ** 2));
        const trunkTop = origin.y + trunkHeight;

        const coords: { attachment: FoliageAttachment; branchBase: number }[] = [
            { attachment: attachment(above(origin, height - 5), 0, false), branchBase: trunkTop }
        ];

        for (let relativeY = height - 5; relativeY >= 0; relativeY--) {
            const shape = fancyTreeShape(height, relativeY);
            if (shape < 0) continue;
            for (let cluster = 0; cluster < clustersPerY; cluster++) {
                const radius = shape * (random.nextFloat() + 0.328);
                const angle = random.nextFloat() * 2 * Math.PI;
                const dx = radius * Math.sin(angle) + 0.5;
                const dz = radius * Math.cos(angle) + 0.5;
                const checkStart = offset(origin, Math.floor(dx), relativeY - 1, Math.floor(dz));
                const checkEnd = above(checkStart, 5);
                if (!makeLimb(context, checkStart, checkEnd, false)) continue;

                const deltaX = origin.x - checkStart.x;
                const deltaZ = origin.z - checkStart.z;
                const branchHeight = checkStart.y - Math.sqrt(deltaX * deltaX + deltaZ * deltaZ) * 0.381;
                const branchTop = branchHeight > trunkTop ? trunkTop : Math.trunc(branchHeight);
                const branchBase = { x: origin.x, y: branchTop, z: origin.z };
                if (makeLimb(context, branchBase, checkStart, false)) {
                    coords.push({ attachment: attachment(checkStart, 0, false), branchBase: branchTop });
                }
            }
        }

        makeLimb(context, origin, above(origin, trunkHeight), true);
        for (const coord of coords) {
            const base = { x: origin.x, y: coord.branchBase, z: origin.z };
            const samePlace =
                base.x === coord.attachment.pos.x &&
                base.y === coord.attachment.pos.y &&
                base.z === coord.attachment.pos.z;
            if (!samePlace && coord.branchBase - origin.y >= height * 0.2) {
                makeLimb(context, base, coord.attachment.pos, true);
            }
        }

        return coords.filter((coord) => coord.branchBase - origin.y >= height * 0.2).map((coord) => coord.attachment);
    });

const fancyTreeShape = (height: number, y: number): number => {
    if (y < f32(height * 0.3)) return -1;
    const radius = f32(height / 2);
    const adjacent = f32(radius - y);
    let distance = f32(Math.sqrt(f32(radius * radius - adjacent * adjacent)));
    if (adjacent === 0) distance = radius;
    else if (Math.abs(adjacent) >= radius) return 0;
    return f32(distance * 0.5);
};

const makeLimb = (context: TreeContext, startPos: BlockPos, endPos: BlockPos, doPlace: boolean): boolean => {
    if (!doPlace && startPos.x === endPos.x && startPos.y === endPos.y && startPos.z === endPos.z) return true;
    const delta = { x: endPos.x - startPos.x, y: endPos.y - startPos.y, z: endPos.z - startPos.z };
    const steps = Math.max(Math.abs(delta.x), Math.max(Math.abs(delta.y), Math.abs(delta.z)));
    if (steps === 0) {
        if (doPlace) placeLog(context, startPos, logAxis(startPos, startPos));
        return true;
    }
    const stepX = f32(delta.x / steps);
    const stepY = f32(delta.y / steps);
    const stepZ = f32(delta.z / steps);

    for (let step = 0; step <= steps; step++) {
        const position = offset(
            startPos,
            Math.floor(f32(0.5 + step * stepX)),
            Math.floor(f32(0.5 + step * stepY)),
            Math.floor(f32(0.5 + step * stepZ))
        );
        if (doPlace) placeLog(context, position, logAxis(startPos, position));
        else if (!context.config.trunkPlacer.isFree(context.world, position)) return false;
    }
    return true;
};

const logAxis = (startPos: BlockPos, position: BlockPos): ((state: BlockState) => BlockState) => {
    const dx = Math.abs(position.x - startPos.x);
    const dz = Math.abs(position.z - startPos.z);
    const maximum = Math.max(dx, dz);
    const axis = maximum > 0 ? (dx === maximum ? 'x' : 'z') : 'y';
    return (state) => ('axis' in state.properties ? withProperty(state, 'axis', axis) : state);
};
