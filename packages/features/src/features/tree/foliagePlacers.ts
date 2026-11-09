/** Java's foliage placers, from `blob_foliage_placer` to `poplar_foliage_placer`. */

import type { RandomSource } from '@jsprismarine/worldgen';
import type { IntProvider } from '../../providers/valueProviders';
import { HORIZONTAL_DIRECTIONS, withProperty } from '../../world/BlockState';
import type { BlockPos } from '../../world/FeatureWorld';
import { offset } from '../../world/FeatureWorld';
import { above, below, relative } from '../support';

import type { FoliageAttachment, FoliagePlacer, TreeContext } from './shared';
import { CLOCKWISE, f32, isDoubleTrunk, validTreePos, waterlogged } from './shared';

// --- Foliage placers -----------------------------------------------------------------------

const tryPlaceLeaf = (context: TreeContext, position: BlockPos): boolean => {
    const existing = context.world.getBlock(position);
    if (existing.properties['persistent'] === 'true') return false;
    if (!validTreePos(context.world, position)) return false;
    const state = context.config.foliageProvider.getState(context.world, context.random, position);
    context.setFoliage(position, waterlogged(context.world, position, state));
    return true;
};

type SkipTest = (
    random: RandomSource,
    dx: number,
    y: number,
    dz: number,
    currentRadius: number,
    doubleTrunk: boolean
) => boolean;

const placeLeavesRow = (
    context: TreeContext,
    origin: BlockPos,
    currentRadius: number,
    y: number,
    doubleTrunk: boolean,
    shouldSkip: SkipTest
): void => {
    const extra = doubleTrunk ? 1 : 0;
    for (let dx = -currentRadius; dx <= currentRadius + extra; dx++) {
        for (let dz = -currentRadius; dz <= currentRadius + extra; dz++) {
            const minDx = doubleTrunk ? Math.min(Math.abs(dx), Math.abs(dx - 1)) : Math.abs(dx);
            const minDz = doubleTrunk ? Math.min(Math.abs(dz), Math.abs(dz - 1)) : Math.abs(dz);
            if (shouldSkip(context.random, minDx, y, minDz, currentRadius, doubleTrunk)) continue;
            tryPlaceLeaf(context, offset(origin, dx, y, dz));
        }
    }
};

const foliageBase = (
    type: string,
    radius: IntProvider,
    offsetProvider: IntProvider,
    heightOf: (random: RandomSource, treeHeight: number) => number,
    create: (
        context: TreeContext,
        treeHeight: number,
        entry: FoliageAttachment,
        foliageHeight: number,
        leafRadius: number,
        placerOffset: number
    ) => void,
    radiusOf?: (random: RandomSource, trunkHeight: number) => number
): FoliagePlacer => ({
    type,
    foliageHeight: heightOf,
    foliageRadius: radiusOf ?? ((random) => radius.sample(random)),
    create: (context, treeHeight, entry, foliageHeight, leafRadius) => {
        create(context, treeHeight, entry, foliageHeight, leafRadius, offsetProvider.sample(context.random));
    }
});

const blobSkip: SkipTest = (random, dx, y, dz, currentRadius) =>
    dx === currentRadius && dz === currentRadius && (random.nextIntBounded(2) === 0 || y === 0);

/** Java's `BlobFoliagePlacer`. */
export const blobFoliagePlacer = (radius: IntProvider, offsetProvider: IntProvider, height: number): FoliagePlacer =>
    foliageBase(
        'blob_foliage_placer',
        radius,
        offsetProvider,
        () => height,
        (context, _treeHeight, entry, foliageHeight, leafRadius, placerOffset) => {
            const total = foliageHeight + entry.foliageHeightOffset;
            for (let yo = placerOffset; yo >= placerOffset - total; yo--) {
                const currentRadius = Math.max(leafRadius + entry.radiusOffsetXZ - 1 - Math.trunc(yo / 2), 0);
                placeLeavesRow(context, entry.pos, currentRadius, yo, isDoubleTrunk(entry), blobSkip);
            }
        }
    );

/** Java's `BushFoliagePlacer`. */
export const bushFoliagePlacer = (radius: IntProvider, offsetProvider: IntProvider, height: number): FoliagePlacer =>
    foliageBase(
        'bush_foliage_placer',
        radius,
        offsetProvider,
        () => height,
        (context, _treeHeight, entry, foliageHeight, leafRadius, placerOffset) => {
            const total = foliageHeight + entry.foliageHeightOffset;
            const skip: SkipTest = (random, dx, _y, dz, currentRadius) =>
                dx === currentRadius && dz === currentRadius && random.nextIntBounded(2) === 0;
            for (let yo = placerOffset; yo >= placerOffset - total; yo--) {
                placeLeavesRow(
                    context,
                    entry.pos,
                    leafRadius + entry.radiusOffsetXZ - 1 - yo,
                    yo,
                    isDoubleTrunk(entry),
                    skip
                );
            }
        }
    );

/** Java's `FancyFoliagePlacer`. */
export const fancyFoliagePlacer = (radius: IntProvider, offsetProvider: IntProvider, height: number): FoliagePlacer =>
    foliageBase(
        'fancy_foliage_placer',
        radius,
        offsetProvider,
        () => height,
        (context, _treeHeight, entry, foliageHeight, leafRadius, placerOffset) => {
            const skip: SkipTest = (_random, dx, _y, dz, currentRadius) =>
                f32(dx + 0.5) ** 2 + f32(dz + 0.5) ** 2 > currentRadius * currentRadius;
            for (let yo = placerOffset; yo >= placerOffset - foliageHeight; yo--) {
                const currentRadius = leafRadius + (yo !== placerOffset && yo !== placerOffset - foliageHeight ? 1 : 0);
                placeLeavesRow(context, entry.pos, currentRadius, yo, isDoubleTrunk(entry), skip);
            }
        }
    );

const edgeSkip: SkipTest = (_random, dx, _y, dz, currentRadius) =>
    dx === currentRadius && dz === currentRadius && currentRadius > 0;

/** Java's `SpruceFoliagePlacer`. */
export const spruceFoliagePlacer = (
    radius: IntProvider,
    offsetProvider: IntProvider,
    trunkHeight: IntProvider
): FoliagePlacer =>
    foliageBase(
        'spruce_foliage_placer',
        radius,
        offsetProvider,
        (random, treeHeight) => Math.max(4, treeHeight - trunkHeight.sample(random)),
        (context, _treeHeight, entry, foliageHeight, leafRadius, placerOffset) => {
            let currentRadius = context.random.nextIntBounded(2);
            let maxRadius = 1;
            let minRadius = 0;
            const total = foliageHeight + entry.foliageHeightOffset;
            for (let yo = placerOffset; yo >= -total; yo--) {
                placeLeavesRow(context, entry.pos, currentRadius, yo, isDoubleTrunk(entry), edgeSkip);
                if (currentRadius >= maxRadius) {
                    currentRadius = minRadius;
                    minRadius = 1;
                    maxRadius = Math.min(maxRadius + 1, leafRadius + entry.radiusOffsetXZ);
                } else {
                    currentRadius++;
                }
            }
        }
    );

/** Java's `PineFoliagePlacer`. */
export const pineFoliagePlacer = (
    radius: IntProvider,
    offsetProvider: IntProvider,
    height: IntProvider
): FoliagePlacer =>
    foliageBase(
        'pine_foliage_placer',
        radius,
        offsetProvider,
        (random) => height.sample(random),
        (context, _treeHeight, entry, foliageHeight, leafRadius, placerOffset) => {
            let currentRadius = 0;
            const total = foliageHeight + entry.foliageHeightOffset;
            for (let yo = placerOffset; yo >= placerOffset - total; yo--) {
                placeLeavesRow(context, entry.pos, currentRadius, yo, isDoubleTrunk(entry), edgeSkip);
                if (currentRadius >= 1 && yo === placerOffset - total + 1) currentRadius--;
                else if (currentRadius < leafRadius + entry.radiusOffsetXZ) currentRadius++;
            }
        },
        (random, trunkHeight) => radius.sample(random) + random.nextIntBounded(Math.max(trunkHeight + 1, 1))
    );

/** Java's `AcaciaFoliagePlacer`. */
export const acaciaFoliagePlacer = (radius: IntProvider, offsetProvider: IntProvider): FoliagePlacer =>
    foliageBase(
        'acacia_foliage_placer',
        radius,
        offsetProvider,
        () => 0,
        (context, _treeHeight, entry, foliageHeight, leafRadius, placerOffset) => {
            const skip: SkipTest = (_random, dx, y, dz, currentRadius) =>
                y === 0
                    ? (dx > 1 || dz > 1) && dx !== 0 && dz !== 0
                    : dx === currentRadius && dz === currentRadius && currentRadius > 0;
            const doubleTrunk = isDoubleTrunk(entry);
            const foliagePos = above(entry.pos, placerOffset);
            const total = foliageHeight + entry.foliageHeightOffset;
            placeLeavesRow(context, foliagePos, leafRadius + entry.radiusOffsetXZ, -1 - total, doubleTrunk, skip);
            placeLeavesRow(context, foliagePos, leafRadius - 1, -total, doubleTrunk, skip);
            placeLeavesRow(context, foliagePos, leafRadius + entry.radiusOffsetXZ - 1, 0, doubleTrunk, skip);
        }
    );

/** Java's `DarkOakFoliagePlacer`. */
export const darkOakFoliagePlacer = (radius: IntProvider, offsetProvider: IntProvider): FoliagePlacer =>
    foliageBase(
        'dark_oak_foliage_placer',
        radius,
        offsetProvider,
        () => 4,
        (context, _treeHeight, entry, _foliageHeight, leafRadius, placerOffset) => {
            const doubleTrunk = isDoubleTrunk(entry);
            const pos = above(entry.pos, placerOffset);
            const skip: SkipTest = (_random, dx, y, dz, currentRadius, isDouble) => {
                if (y === -1 && !isDouble) return dx === currentRadius && dz === currentRadius;
                return y === 1 ? dx + dz > currentRadius * 2 - 2 : false;
            };
            const rowWithCorners = (currentRadius: number, y: number): void => {
                const extra = doubleTrunk ? 1 : 0;
                for (let dx = -currentRadius; dx <= currentRadius + extra; dx++) {
                    for (let dz = -currentRadius; dz <= currentRadius + extra; dz++) {
                        // Dark oak drops the four outer corners of its widest row.
                        const cutCorner =
                            y === 0 &&
                            doubleTrunk &&
                            (dx === -currentRadius || dx >= currentRadius) &&
                            (dz === -currentRadius || dz >= currentRadius);
                        if (cutCorner) continue;
                        const minDx = doubleTrunk ? Math.min(Math.abs(dx), Math.abs(dx - 1)) : Math.abs(dx);
                        const minDz = doubleTrunk ? Math.min(Math.abs(dz), Math.abs(dz - 1)) : Math.abs(dz);
                        if (skip(context.random, minDx, y, minDz, currentRadius, doubleTrunk)) continue;
                        tryPlaceLeaf(context, offset(pos, dx, y, dz));
                    }
                }
            };

            if (doubleTrunk) {
                rowWithCorners(leafRadius + 2, -1);
                rowWithCorners(leafRadius + 3, 0);
                rowWithCorners(leafRadius + 2, 1);
                if (context.random.nextBoolean()) rowWithCorners(leafRadius, 2);
            } else {
                rowWithCorners(leafRadius + 2, -1);
                rowWithCorners(leafRadius + 1, 0);
            }
        }
    );

/** Java's `MegaJungleFoliagePlacer`. */
export const megaJungleFoliagePlacer = (
    radius: IntProvider,
    offsetProvider: IntProvider,
    height: number
): FoliagePlacer =>
    foliageBase(
        'jungle_foliage_placer',
        radius,
        offsetProvider,
        () => height,
        (context, _treeHeight, entry, foliageHeight, leafRadius, placerOffset) => {
            const skip: SkipTest = (_random, dx, _y, dz, currentRadius) =>
                dx + dz >= 7 ? true : dx * dx + dz * dz > currentRadius * currentRadius;
            const doubleTrunk = isDoubleTrunk(entry);
            const leafHeight =
                (doubleTrunk ? foliageHeight : 1 + context.random.nextIntBounded(2)) + entry.foliageHeightOffset;
            for (let yo = placerOffset; yo >= placerOffset - leafHeight; yo--) {
                placeLeavesRow(context, entry.pos, leafRadius + entry.radiusOffsetXZ + 1 - yo, yo, doubleTrunk, skip);
            }
        }
    );

/** Java's `MegaPineFoliagePlacer`. */
export const megaPineFoliagePlacer = (
    radius: IntProvider,
    offsetProvider: IntProvider,
    crownHeight: IntProvider
): FoliagePlacer =>
    foliageBase(
        'mega_pine_foliage_placer',
        radius,
        offsetProvider,
        (random) => crownHeight.sample(random),
        (context, _treeHeight, entry, foliageHeight, leafRadius, placerOffset) => {
            const skip: SkipTest = (_random, dx, _y, dz, currentRadius) =>
                dx + dz >= 7 ? true : dx * dx + dz * dz > currentRadius * currentRadius;
            const doubleTrunk = isDoubleTrunk(entry);
            const total = foliageHeight + entry.foliageHeightOffset;
            let previousRadius = 0;
            for (let y = entry.pos.y - total + placerOffset; y <= entry.pos.y + placerOffset; y++) {
                const yo = entry.pos.y - y;
                const smoothRadius = leafRadius + entry.radiusOffsetXZ + Math.floor(f32((yo / total) * 3.5));
                const jaggedRadius =
                    yo > 0 && smoothRadius === previousRadius && (y & 1) === 0 ? smoothRadius + 1 : smoothRadius;
                placeLeavesRow(context, { x: entry.pos.x, y, z: entry.pos.z }, jaggedRadius, 0, doubleTrunk, skip);
                previousRadius = smoothRadius;
            }
        }
    );

/** Java's `CherryFoliagePlacer`. */
export const cherryFoliagePlacer = (
    radius: IntProvider,
    offsetProvider: IntProvider,
    height: IntProvider,
    wideBottomLayerHoleChance: number,
    cornerHoleChance: number,
    hangingLeavesChance: number,
    hangingLeavesExtensionChance: number
): FoliagePlacer =>
    foliageBase(
        'cherry_foliage_placer',
        radius,
        offsetProvider,
        (random) => height.sample(random),
        (context, _treeHeight, entry, foliageHeight, leafRadius, placerOffset) => {
            const skip: SkipTest = (random, dx, y, dz, currentRadius) => {
                if (
                    y === -1 &&
                    (dx === currentRadius || dz === currentRadius) &&
                    random.nextFloat() < wideBottomLayerHoleChance
                ) {
                    return true;
                }
                const corner = dx === currentRadius && dz === currentRadius;
                return currentRadius > 2
                    ? corner || (dx + dz > currentRadius * 2 - 2 && random.nextFloat() < cornerHoleChance)
                    : corner && random.nextFloat() < cornerHoleChance;
            };
            const doubleTrunk = isDoubleTrunk(entry);
            const foliagePos = above(entry.pos, placerOffset);
            const currentRadius = leafRadius + entry.radiusOffsetXZ - 1;
            const total = foliageHeight + entry.foliageHeightOffset;

            placeLeavesRow(context, foliagePos, currentRadius - 2, total - 3, doubleTrunk, skip);
            placeLeavesRow(context, foliagePos, currentRadius - 1, total - 4, doubleTrunk, skip);
            for (let y = total - 5; y >= 0; y--)
                placeLeavesRow(context, foliagePos, currentRadius, y, doubleTrunk, skip);
            placeHangingRow(
                context,
                foliagePos,
                currentRadius,
                -1,
                doubleTrunk,
                skip,
                hangingLeavesChance,
                hangingLeavesExtensionChance
            );
            placeHangingRow(
                context,
                foliagePos,
                currentRadius - 1,
                -2,
                doubleTrunk,
                skip,
                hangingLeavesChance,
                hangingLeavesExtensionChance
            );
        }
    );

const placeHangingRow = (
    context: TreeContext,
    origin: BlockPos,
    currentRadius: number,
    y: number,
    doubleTrunk: boolean,
    shouldSkip: SkipTest,
    hangingLeavesChance: number,
    hangingLeavesExtensionChance: number
): void => {
    placeLeavesRow(context, origin, currentRadius, y, doubleTrunk, shouldSkip);
    const extra = doubleTrunk ? 1 : 0;
    const logPos = below(origin);

    for (const alongEdge of HORIZONTAL_DIRECTIONS) {
        const toEdge = CLOCKWISE[alongEdge];
        const positive = toEdge === 'south' || toEdge === 'east' || toEdge === 'up';
        const offsetToEdge = positive ? currentRadius + extra : currentRadius;
        let position = relative(relative(offset(origin, 0, y, 0), toEdge, offsetToEdge), alongEdge, -currentRadius);

        for (let step = -currentRadius; step < currentRadius + extra; step++) {
            const leavesAbove = context.hasFoliage(above(position));
            if (leavesAbove && tryPlaceExtension(context, hangingLeavesChance, logPos, below(position))) {
                tryPlaceExtension(context, hangingLeavesExtensionChance, logPos, below(position, 2));
            }
            position = relative(position, alongEdge);
        }
    }
};

const tryPlaceExtension = (context: TreeContext, chance: number, logPos: BlockPos, position: BlockPos): boolean => {
    const distance =
        Math.abs(position.x - logPos.x) + Math.abs(position.y - logPos.y) + Math.abs(position.z - logPos.z);
    if (distance >= 7) return false;
    if (context.random.nextFloat() > chance) return false;
    return tryPlaceLeaf(context, position);
};

/** Java's `RandomSpreadFoliagePlacer`. */
export const randomSpreadFoliagePlacer = (
    radius: IntProvider,
    offsetProvider: IntProvider,
    foliageHeightProvider: IntProvider,
    leafPlacementAttempts: number
): FoliagePlacer =>
    foliageBase(
        'random_spread_foliage_placer',
        radius,
        offsetProvider,
        (random) => foliageHeightProvider.sample(random),
        (context, _treeHeight, entry, foliageHeight, leafRadius) => {
            for (let attempt = 0; attempt < leafPlacementAttempts; attempt++) {
                const position = offset(
                    entry.pos,
                    context.random.nextIntBounded(leafRadius) - context.random.nextIntBounded(leafRadius),
                    context.random.nextIntBounded(foliageHeight) - context.random.nextIntBounded(foliageHeight),
                    context.random.nextIntBounded(leafRadius) - context.random.nextIntBounded(leafRadius)
                );
                tryPlaceLeaf(context, position);
            }
        }
    );

/**
 * The poplar crown, which is a rhombus with a log spine rather than a blob.
 *
 * Java threads the foliage height and a flip flag through its own row placer rather than the
 * shared one, because the shape of a row depends on where it sits in the crown.
 */
export const poplarFoliagePlacer = (
    radius: IntProvider,
    offsetProvider: IntProvider,
    height: IntProvider,
    sideHoleChance: number
): FoliagePlacer =>
    foliageBase(
        'poplar_foliage_placer',
        radius,
        offsetProvider,
        (random) => height.sample(random),
        (context, _treeHeight, entry, foliageHeight, leafRadius, placerOffset) => {
            const doubleTrunk = isDoubleTrunk(entry);
            const foliagePos = above(entry.pos, placerOffset);
            const currentRadius = leafRadius + entry.radiusOffsetXZ - 1;
            const flip = context.random.nextBoolean();
            const total = foliageHeight + entry.foliageHeightOffset;

            const partialRow = (y: number) => total - 1 === y || total - 2 === y;
            const cornersToCut = (dx: number, dz: number, rowRadius: number, partial: boolean) => {
                const small = flip
                    ? (dx > 0 && dz > 0) || (dz < 0 && dx < 0)
                    : (dx > 0 && dz < 0) || (dz > 0 && dx < 0);
                return small ? rowRadius - 1 : partial ? rowRadius + 1 : rowRadius;
            };
            const withinRhombus = (rowRadius: number, absDx: number, absDz: number, cut: number, extra: number) =>
                absDx + absDz <= rowRadius * 2 - (cut + extra);

            const row = (rowRadius: number, y: number) => {
                const extra = doubleTrunk ? 1 : 0;
                for (let dx = -rowRadius; dx <= rowRadius + extra; dx++) {
                    for (let dz = -rowRadius; dz <= rowRadius + extra; dz++) {
                        const partial = partialRow(y);
                        const cut = cornersToCut(dx, dz, rowRadius, partial);
                        const absDx = Math.abs(dx);
                        const absDz = Math.abs(dz);
                        const onEdge = absDx === rowRadius || absDz === rowRadius;
                        if (partial && onEdge) continue;
                        const extraRemoval = context.random.nextFloat() <= sideHoleChance ? 1 : 0;
                        if (!withinRhombus(rowRadius, absDx, absDz, cut, extraRemoval)) continue;
                        tryPlaceLeaf(context, offset(foliagePos, dx, y, dz));
                    }
                }
            };

            row(currentRadius - 2, total - 1);
            row(currentRadius - 1, total - 2);
            row(currentRadius - 1, total - 3);
            for (let y = total - 4; y >= 1; y--) row(currentRadius, y);

            // The spine: four log arms replacing leaves along the rhombus axes.
            const spineY = total - 4;
            const extra = doubleTrunk ? 1 : 0;
            for (let dx = -currentRadius; dx <= currentRadius + extra; dx++) {
                for (let dz = -currentRadius; dz <= currentRadius + extra; dz++) {
                    const absDx = Math.abs(dx);
                    const absDz = Math.abs(dz);
                    const cut = cornersToCut(dx, dz, currentRadius, partialRow(spineY));
                    const alongAxis =
                        (absDz === 0 && currentRadius - absDx >= 4) || (absDx === 0 && currentRadius - absDz >= 4);
                    if (!withinRhombus(currentRadius, absDx, absDz, cut, 2) || !alongAxis) continue;
                    const position = offset(foliagePos, dx, spineY, dz);
                    const expected = context.config.foliageProvider.getState(context.world, context.random, position);
                    if (context.world.getBlock(position).name !== expected.name) continue;
                    const axis = absDz === 0 ? 'x' : 'z';
                    const log = context.config.trunkProvider.getState(context.world, context.random, position);
                    context.setFoliage(position, 'axis' in log.properties ? withProperty(log, 'axis', axis) : log);
                }
            }

            row(currentRadius - 1, 0);
            row(Math.min(Math.max(currentRadius - 2, 1), 2), -1);
        }
    );
