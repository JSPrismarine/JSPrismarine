/**
 * Java's `minecraft:tree` feature: grows the trunk, then the foliage, then the roots, and runs
 * the decorators over what was placed.
 *
 * The placers and decorators live under `./tree/`, one module per Java package.
 */

import { constantInt } from '../providers/valueProviders';
import type { BlockPos } from '../world/FeatureWorld';
import { offset } from '../world/FeatureWorld';
import type { ConfiguredFeature } from './Feature';
import type { FeatureParsers } from './parseContext';
import { feature } from './Feature';
import { JavaHashSet } from './javaHashSet';

import { parseTreeConfig, parseTreeDecorator, parseTrunkPlacer } from './tree/parse';
import type { DecoratorContext, TreeConfig, TreeContext } from './tree/shared';
import { isVine, placeLog, validTreePos } from './tree/shared';

export type {
    DecoratorContext,
    FeatureSize,
    FoliageAttachment,
    FoliagePlacer,
    RootPlacer,
    TreeConfig,
    TreeContext,
    TreeDecorator,
    TrunkPlacer
} from './tree/shared';
export { validTreePos } from './tree/shared';
export { parseTreeConfig } from './tree/parse';

/**
 * Builds a tree, Java's `TreeFeature`.
 *
 * Forty-five of the 240 vanilla configured features are this one type. All of the variety lives
 * in the four composable parts: a trunk placer that returns where foliage should attach, a
 * foliage placer that fills those attachments, an optional root placer, and a list of decorators.
 *
 * The order of the draws is the part worth stating. `tree_height` comes first, then
 * `foliage_height`, then `foliage_radius`, then the root placer's trunk offset, then the whole
 * trunk, then each attachment's foliage in the order the trunk placer returned them, then the
 * decorators in their declared order. Moving any of those moves every block after it.
 */
export const tree = (config: TreeConfig): ConfiguredFeature =>
    feature('tree', (world, random, origin) => {
        const roots = new JavaHashSet();
        const trunks = new JavaHashSet();
        const foliage = new JavaHashSet();
        const decorations = new JavaHashSet();

        const context: TreeContext = {
            world,
            random,
            config,
            setTrunk: (position, state) => {
                trunks.add(position);
                world.setBlock(position, state);
            },
            setRoot: (position, state) => {
                roots.add(position);
                world.setBlock(position, state);
            },
            setFoliage: (position, state) => {
                foliage.add(position);
                world.setBlock(position, state);
            },
            hasFoliage: (position) => foliage.has(position)
        };

        const treeHeight = config.trunkPlacer.treeHeight(random);
        const foliageHeight = config.foliagePlacer.foliageHeight(random, treeHeight);
        const trunkHeight = treeHeight - foliageHeight;
        const leafRadius = config.foliagePlacer.foliageRadius(random, trunkHeight);
        const trunkOrigin = config.rootPlacer?.trunkOrigin(origin, random) ?? origin;

        const minY = Math.min(origin.y, trunkOrigin.y);
        const maxY = Math.max(origin.y, trunkOrigin.y) + treeHeight + 1;
        if (minY < world.minY + 1 || maxY > world.minY + world.height) return false;

        const clippedHeight = maxFreeTreeHeight(context, treeHeight, trunkOrigin);
        const minClipped = config.minimumSize.minClippedHeight;
        if (clippedHeight < treeHeight && !(minClipped !== undefined && clippedHeight >= minClipped)) return false;
        if (config.rootPlacer !== undefined && !config.rootPlacer.place(context, origin, trunkOrigin)) return false;

        const attachments = config.trunkPlacer.place(context, clippedHeight, trunkOrigin);
        for (const entry of attachments) {
            config.foliagePlacer.create(context, clippedHeight, entry, foliageHeight, leafRadius);
        }

        if (trunks.size === 0 && foliage.size === 0) return false;
        if (config.decorators.length === 0) return true;

        const decoratorContext: DecoratorContext = {
            world,
            random,
            logs: trunks.sortedByY(),
            leaves: foliage.sortedByY(),
            roots: roots.toArray(),
            setBlock: (position, state) => {
                decorations.add(position);
                world.setBlock(position, state);
            }
        };
        for (const decorator of config.decorators) decorator.place(decoratorContext);
        return true;
    });

const maxFreeTreeHeight = (context: TreeContext, maxTreeHeight: number, treePos: BlockPos): number => {
    const { world, config } = context;
    for (let y = 0; y <= maxTreeHeight + 1; y++) {
        const radius = config.minimumSize.sizeAtHeight(maxTreeHeight, y);
        for (let x = -radius; x <= radius; x++) {
            for (let z = -radius; z <= radius; z++) {
                const position = offset(treePos, x, y, z);
                const blocked =
                    !config.trunkPlacer.isFree(world, position) || (!config.ignoreVines && isVine(world, position));
                if (blocked) return y - 2;
            }
        }
    }
    return maxTreeHeight;
};

/** Reads the `tree` feature type. */
export const parseTreeFeature = (
    type: string,
    raw: Record<string, unknown>,
    path: string,
    parsers: FeatureParsers
): ConfiguredFeature | undefined => (type === 'tree' ? tree(parseTreeConfig(raw, path, parsers)) : undefined);

/** Exposed for the sibling `fallen_tree` feature, which reuses the trunk and decorator parsers. */
export const treeInternals = {
    parseTrunkPlacer,
    parseTreeDecorator,
    placeLog,
    validTreePos,
    constantInt
};
