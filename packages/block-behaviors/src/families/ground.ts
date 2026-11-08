/**
 * The ground families: soil and the blocks that fall, ice, snow and the
 * dripstone and amethyst cluster.
 */
import type { HookBlock } from '@jsprismarine/blocks';
import { BLOCK_FACES } from '@jsprismarine/blocks';

import { defineFamily } from '../family';
import { offset, opposite } from '../geometry';
import { AIR, isWater, WATER } from '../identifiers';
import { fallOneStep, isFallingBlock, scheduleFall } from '../rules/gravity';
import { hasSilkTouch } from '../rules/heldItem';
import { dampensLightMoreThan } from '../rules/light';
import { breakBlock, isSolidSupport, popWithoutSupport } from '../rules/support';
import { bareName, hasState, setStates, sibling, stateNumber, stateString } from '../state';
import type { WorldActions } from '../world';
import { dropSelf } from './shared';

/** How far from a crop farmland looks for water before it dries out. */
export const FARMLAND_WATER_RANGE = 4;

/** The light level at which ice and snow melt. */
export const MELT_LIGHT = 12;

/** Java's `#minecraft:maintains_farmland`, which decides whether dry farmland stays farmland. */
export const MAINTAINS_FARMLAND_TAG = 'minecraft:maintains_farmland';

/**
 * Java's `#minecraft:maintains_farmland`, for a host that answers no tags at all.
 *
 * The tag is the source of truth and this is only reached when the stack declares no such
 * tag, so
 * these are the vanilla members written in Bedrock's spelling - `beetroot` for Java's
 * `beetroots` - minus what a tagless host cannot resolve: `#minecraft:fence_gates` is a nested
 * tag and `moving_piston` is a block this server does not have. Java's two attached stems are
 * not here because Bedrock has no block for them; an attached stem is a state of the stem.
 */
const MAINTAINS_FARMLAND_FALLBACK_NAMES: ReadonlySet<string> = new Set([
    'wheat',
    'carrots',
    'potatoes',
    'beetroot',
    'pumpkin_stem',
    'melon_stem',
    'torchflower_crop',
    'torchflower',
    'pitcher_crop'
]);

/**
 * Whether what stands on a farmland block keeps it from turning back to dirt.
 *
 * Java's `FarmBlock.shouldMaintainFarmland`, which is a tag rather than a shape: an attached
 * melon stem has no growth of its own and still holds the field, a fence gate over farmland
 * holds it, and a sweet berry bush - which does grow - does not.
 */
const maintainsFarmland = (world: WorldActions, block: HookBlock): boolean => {
    const planted = world.getBlock(offset(block.position, 'up'));
    if (planted === undefined) return false;

    return (
        world.hasBlockTag?.(planted, MAINTAINS_FARMLAND_TAG) ??
        MAINTAINS_FARMLAND_FALLBACK_NAMES.has(bareName(planted.identifier))
    );
};

/** Whether water is within {@link FARMLAND_WATER_RANGE} of a farmland block. */
export const isHydrated = (world: WorldActions, block: HookBlock): boolean => {
    for (let x = -FARMLAND_WATER_RANGE; x <= FARMLAND_WATER_RANGE; x += 1) {
        for (let z = -FARMLAND_WATER_RANGE; z <= FARMLAND_WATER_RANGE; z += 1) {
            for (let y = 0; y <= 1; y += 1) {
                const position = { x: block.position.x + x, y: block.position.y + y, z: block.position.z + z };
                const found = world.getBlock(position);
                if (found !== undefined && isWater(found.identifier)) return true;
            }
        }
    }
    return false;
};

/** Whether water touches a concrete powder on any side but below, which is what turns it to concrete. */
const touchesWater = (world: WorldActions, block: HookBlock): boolean =>
    BLOCK_FACES.some((face) => {
        if (face === 'down') return false;
        const neighbor = world.getBlock(offset(block.position, face));
        return neighbor !== undefined && isWater(neighbor.identifier);
    });

/** Replaces a powder with the concrete of its color, keeping it where it is. */
const harden = (world: WorldActions, block: HookBlock): void => {
    world.setBlock(block.position, sibling(block.identifier, bareName(block.identifier).replace('_powder', '')));
    world.notifyNeighbors(block.position);
};

/** Concrete powder: it falls like sand and sets into concrete when water touches it. */
export const concretePowderFamily = defineFamily(
    'jsprismarine:concrete_powder',
    'Falls when nothing holds it up, and turns into concrete of its color when water touches any side but below, or when it falls into water.',
    {
        onPlace: (event, world) => {
            if (touchesWater(world, event.block)) {
                harden(world, event.block);
                return;
            }
            scheduleFall(world, event.block);
        },
        onNeighborChanged: (event, world) => {
            if (touchesWater(world, event.block)) {
                harden(world, event.block);
                return;
            }
            scheduleFall(world, event.block);
        },
        onTick: (event, world) => {
            const enteringWater = isWater(world.getBlock(offset(event.block.position, 'down'))?.identifier ?? AIR);
            if (fallOneStep(world, event.block) !== 'fell') {
                if (touchesWater(world, event.block)) harden(world, event.block);
                return;
            }
            if (enteringWater) {
                const landed = world.getBlock(offset(event.block.position, 'down'));
                if (landed !== undefined) harden(world, landed);
            }
        },
        onBreak: (event, world) => {
            dropSelf(world, event.brokenBlock);
        }
    }
);

/**
 * Soil: dirt and its variants, sand and gravel, farmland and the spreading
 * ground covers.
 */
export const soilFamily = defineFamily(
    'jsprismarine:soil',
    'Falls when it is sand, gravel or a suspicious block, keeps farmland moisture from nearby water, turns farmland back to dirt when something lands on it, and spreads grass onto dirt.',
    {
        onPlace: (event, world) => {
            if (isFallingBlock(event.block.identifier)) scheduleFall(world, event.block);
        },
        onNeighborChanged: (event, world) => {
            if (isFallingBlock(event.block.identifier)) {
                scheduleFall(world, event.block);
                return;
            }
            if (bareName(event.block.identifier) !== 'grass_path') return;
            if (isSolidSupport(world, offset(event.block.position, 'up'))) {
                world.setBlock(event.block.position, sibling(event.block.identifier, 'dirt'));
            }
        },
        onTick: (event, world) => {
            if (!isFallingBlock(event.block.identifier)) return;
            fallOneStep(world, event.block);
        },
        onRandomTick: (event, world) => {
            const name = bareName(event.block.identifier);

            if (name === 'farmland') {
                const moisture = stateNumber(event.block, 'moisturized_amount');
                if (isHydrated(world, event.block)) {
                    if (moisture < 7) setStates(world, event.block, { moisturized_amount: 7 });
                    return;
                }
                if (moisture > 0) {
                    setStates(world, event.block, { moisturized_amount: moisture - 1 });
                    return;
                }
                if (maintainsFarmland(world, event.block)) return;
                world.setBlock(event.block.position, sibling(event.block.identifier, 'dirt'));
                return;
            }

            if (name !== 'grass_block' && name !== 'mycelium') return;
            const coverPosition = offset(event.block.position, 'up');
            const cover = world.getBlock(coverPosition);
            if (cover !== undefined && world.lightLevel(coverPosition) < 4 && dampensLightMoreThan(world, cover, 2)) {
                world.setBlock(event.block.position, sibling(event.block.identifier, 'dirt'));
                return;
            }
            for (const face of BLOCK_FACES) {
                const neighbor = world.getBlock(offset(event.block.position, face));
                if (neighbor === undefined || bareName(neighbor.identifier) !== 'dirt') continue;
                if (world.lightLevel(offset(neighbor.position, 'up')) < 4) continue;
                if (world.random() >= 1 / 4) continue;
                world.setBlock(neighbor.position, event.block.identifier);
                return;
            }
        },
        onEntityFallOn: (event, world) => {
            if (bareName(event.block.identifier) !== 'farmland') return;
            if (event.fallDistance < 0.5) return;
            world.setBlock(event.block.position, sibling(event.block.identifier, 'dirt'));
        },
        onBreak: (event, world) => {
            dropSelf(world, event.brokenBlock);
        }
    }
);

/** Ice, packed ice and frosted ice, which melt in the light. */
export const iceFamily = defineFamily(
    'jsprismarine:ice',
    'Melts to water on a random tick above light 12, frosted ice ages through its four stages first, and a silk touch tool takes the block itself instead of leaving water.',
    {
        onRandomTick: (event, world) => {
            const name = bareName(event.block.identifier);
            if (name === 'packed_ice' || name === 'blue_ice') return;
            if (world.lightLevel(offset(event.block.position, 'up')) < MELT_LIGHT) return;

            if (name === 'frosted_ice') {
                const age = stateNumber(event.block, 'age');
                if (age < 3) {
                    setStates(world, event.block, { age: age + 1 });
                    return;
                }
                world.setBlock(event.block.position, WATER, { liquid_depth: 0 });
                world.notifyNeighbors(event.block.position);
                return;
            }

            world.setBlock(event.block.position, WATER, { liquid_depth: 0 });
            world.notifyNeighbors(event.block.position);
        },
        onBreak: (event, world) => {
            if (hasSilkTouch(event.itemStack)) {
                dropSelf(world, event.brokenBlock);
                return;
            }
            world.setBlock(event.brokenBlock.position, WATER, { liquid_depth: 0 });
        }
    }
);

/** Snow layers and the snow block. */
export const snowFamily = defineFamily(
    'jsprismarine:snow',
    'Melts on a random tick above light 12, drops one snowball per layer, and pops without support.',
    {
        onRandomTick: (event, world) => {
            if (world.lightLevel(offset(event.block.position, 'up')) < MELT_LIGHT) return;
            breakBlock(world, event.block);
        },
        onNeighborChanged: (event, world) => {
            if (!hasState(event.block, 'height')) return;
            popWithoutSupport(world, event.block);
        },
        onBreak: (event, world) => {
            if (!hasState(event.brokenBlock, 'height')) {
                dropSelf(world, event.brokenBlock);
                return;
            }
            world.dropItem(event.brokenBlock.position, {
                identifier: sibling(event.brokenBlock.identifier, 'snowball'),
                count: stateNumber(event.brokenBlock, 'height') + 1
            });
        }
    }
);

/** The four amethyst bud stages, in the order a budding block grows them. */
export const AMETHYST_STAGES: readonly string[] = [
    'small_amethyst_bud',
    'medium_amethyst_bud',
    'large_amethyst_bud',
    'amethyst_cluster'
];

/** Dripstone, amethyst and budding amethyst. */
export const dripstoneFamily = defineFamily(
    'jsprismarine:dripstone',
    'Grows an amethyst bud on a free face of a budding block, advances a bud a stage, and drops shards from a cluster.',
    {
        onRandomTick: (event, world) => {
            const name = bareName(event.block.identifier);

            if (name === 'budding_amethyst') {
                if (world.random() >= 1 / 5) return;
                const first = AMETHYST_STAGES[0];
                if (first === undefined) return;
                for (const face of BLOCK_FACES) {
                    const position = offset(event.block.position, face);
                    const neighbor = world.getBlock(position);
                    if (neighbor === undefined || neighbor.identifier !== AIR) continue;
                    world.setBlock(position, sibling(event.block.identifier, first), {
                        'minecraft:block_face': face
                    });
                    return;
                }
                return;
            }

            const stage = AMETHYST_STAGES.indexOf(name);
            if (stage === -1 || stage === AMETHYST_STAGES.length - 1) return;
            if (world.random() >= 1 / 5) return;
            const next = AMETHYST_STAGES[stage + 1];
            if (next === undefined) return;
            world.setBlock(event.block.position, sibling(event.block.identifier, next), event.block.states);
        },
        onNeighborChanged: (event, world) => {
            if (!hasState(event.block, 'minecraft:block_face')) {
                if (hasState(event.block, 'dripstone_thickness')) popWithoutSupport(world, event.block, 'up');
                return;
            }
            // `minecraft:block_face` names the face the cluster grows out
            // of, so the block holding it up is across from that face.
            const grown = stateString(event.block, 'minecraft:block_face', 'down');
            const face = BLOCK_FACES.find((candidate) => candidate === grown);
            if (face !== undefined) popWithoutSupport(world, event.block, opposite(face));
        },
        onBreak: (event, world) => {
            if (bareName(event.brokenBlock.identifier) !== 'amethyst_cluster') {
                dropSelf(world, event.brokenBlock);
                return;
            }
            world.dropItem(event.brokenBlock.position, {
                identifier: sibling(event.brokenBlock.identifier, 'amethyst_shard'),
                count: 4
            });
        }
    }
);
