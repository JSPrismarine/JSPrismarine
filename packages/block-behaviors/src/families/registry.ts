/**
 * Every behavior family, and the one call that registers them all.
 *
 * The list covers each name in `@jsprismarine/blocks`'s
 * `BLOCK_BEHAVIOR_NAMES`, and `registry.test.ts` fails when the two stop
 * agreeing, so a new family rule cannot land without a behavior behind it.
 */
import type { BlockHooks } from '@jsprismarine/blocks';
import { behavior } from '@jsprismarine/blocks';
import type { BehaviorRegistry } from '@jsprismarine/content';

import type { BlockFamily } from '../family';
import { componentValue, familyBehavior } from '../family';
import type { BlockWorld } from '../world';
import {
    cauldronFamily,
    composterFamily,
    containerFamily,
    flowerPotFamily,
    furnaceFamily,
    utilityFamily
} from './containers';
import {
    bannerFamily,
    bedFamily,
    cakeFamily,
    candleFamily,
    headFamily,
    lanternFamily,
    signFamily,
    torchFamily
} from './furniture';
import { dripstoneFamily, iceFamily, snowFamily, soilFamily } from './ground';
import { doorFamily, fenceGateFamily, trapdoorFamily } from './openable';
import {
    bambooFamily,
    climbingFamily,
    cropFamily,
    dripleafFamily,
    eggFamily,
    floraFamily,
    leavesFamily,
    saplingFamily
} from './plants';
import { buttonFamily, pressurePlateFamily, railFamily, redstoneFamily } from './redstone';
import { doubleSlabFamily, fenceFamily, paneFamily, slabFamily, stairsFamily, wallFamily } from './shapes';
import { chemistryFamily, glassFamily, inertFamily, logFamily, oreFamily, plainBlockFamily } from './simple';
import { copperFamily, liquidFamily, portalFamily, sculkFamily } from './world';

/** Every vanilla block behavior family, in the order they are registered. */
export const VANILLA_BLOCK_FAMILIES: readonly BlockFamily[] = [
    plainBlockFamily,
    inertFamily,
    glassFamily,
    logFamily,
    oreFamily,
    chemistryFamily,
    slabFamily,
    doubleSlabFamily,
    stairsFamily,
    wallFamily,
    fenceFamily,
    paneFamily,
    doorFamily,
    trapdoorFamily,
    fenceGateFamily,
    redstoneFamily,
    buttonFamily,
    pressurePlateFamily,
    railFamily,
    cropFamily,
    saplingFamily,
    leavesFamily,
    floraFamily,
    bambooFamily,
    climbingFamily,
    dripleafFamily,
    eggFamily,
    soilFamily,
    iceFamily,
    snowFamily,
    dripstoneFamily,
    containerFamily,
    furnaceFamily,
    cauldronFamily,
    composterFamily,
    flowerPotFamily,
    utilityFamily,
    signFamily,
    bannerFamily,
    headFamily,
    bedFamily,
    cakeFamily,
    candleFamily,
    torchFamily,
    lanternFamily,
    liquidFamily,
    portalFamily,
    sculkFamily,
    copperFamily
];

/**
 * Registers every family and attaches it to definitions whose
 * `jsprismarine:behavior` component names that family. Definitions without
 * the component receive no vanilla behavior.
 *
 * @param registry - The registry `resolveBlocks` is given.
 * @param world - What the behaviors act on. The server passes its own
 *   dimensions; a test passes a {@link VoxelWorld}.
 */
export const registerVanillaBlockBehaviors = (registry: BehaviorRegistry<BlockHooks>, world: BlockWorld): void => {
    for (const family of VANILLA_BLOCK_FAMILIES) {
        registry.register(familyBehavior(family, world));
        registry.attach(family.name, (_, definition) => {
            const declared = definition === undefined ? undefined : componentValue(definition, behavior.name);
            return declared === family.name;
        });
    }
};
