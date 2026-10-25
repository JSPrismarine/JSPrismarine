/**
 * Everything that grows: crops, saplings, leaves, flowers, the segmented
 * plants, the climbing blocks, the dripleaves and the eggs.
 */
import type { HookBlock } from '@jsprismarine/blocks';

import { defineFamily } from '../family';
import { faceOfFacingDirection, offset, opposite } from '../geometry';
import { AIR, isWater } from '../identifiers';
import {
    advanceCounter,
    cropGrowthChance,
    FARMLAND_NAMES,
    hasNearbyLog,
    MAX_CROP_GROWTH,
    SOIL_NAMES
} from '../rules/growth';
import { breakBlock, isSolidSupport, popBlock, popWithoutGround, popWithoutSupport } from '../rules/support';
import { bareName, hasState, setStates, sibling, stateBoolean, stateNumber } from '../state';
import type { WorldActions } from '../world';
import { dropSelf } from './shared';

/** The counter state each growing block uses, by bare name. */
const GROWTH_STATES: Readonly<Record<string, { readonly state: string; readonly max: number }>> = {
    cocoa: { state: 'age', max: 2 },
    nether_wart: { state: 'age', max: 3 },
    reeds: { state: 'age', max: 15 },
    cactus: { state: 'age', max: 15 },
    kelp: { state: 'kelp_age', max: 25 },
    cave_vines: { state: 'growing_plant_age', max: 25 },
    twisting_vines: { state: 'twisting_vines_age', max: 25 },
    weeping_vines: { state: 'weeping_vines_age', max: 25 },
    chorus_flower: { state: 'age', max: 5 },
    bamboo: { state: 'age_bit', max: 1 }
};

const growthOf = (identifier: string): { readonly state: string; readonly max: number } =>
    GROWTH_STATES[bareName(identifier)] ?? { state: 'growth', max: MAX_CROP_GROWTH };

/** How many blocks a stalk of sugar cane, cactus or bamboo grows to. */
export const MAX_STALK_HEIGHT: Readonly<Record<string, number>> = { reeds: 3, cactus: 3, bamboo: 16 };

/** Grows a stalk upward by one when its counter wraps, which is how reeds and cactus work. */
const growStalk = (world: WorldActions, block: HookBlock, maxHeight: number): boolean => {
    let height = 1;
    while (height < maxHeight) {
        const below = world.getBlock(offset(block.position, 'down', height));
        if (below === undefined || below.identifier !== block.identifier) break;
        height += 1;
    }
    if (height >= maxHeight) return false;

    const above = offset(block.position, 'up');
    const target = world.getBlock(above);
    if (target === undefined || target.identifier !== AIR) return false;

    world.setBlock(above, block.identifier, { ...block.states, age: 0 });
    world.notifyNeighbors(above);
    return true;
};

/** Crops, including the two-block pitcher crop and the berry bushes. */
export const cropFamily = defineFamily(
    'jsprismarine:crop',
    'Advances growth on a random tick at a chance the farmland moisture sets, pops off anything but farmland, and harvests the berry blocks on interact.',
    {
        onRandomTick: (event, world) => {
            const growth = growthOf(event.block.identifier);
            const name = bareName(event.block.identifier);

            if (name === 'nether_wart') {
                advanceCounter(world, event.block, growth.state, growth.max, 1 / 10);
                return;
            }
            if (name === 'cocoa' || name === 'cave_vines' || name === 'sweet_berry_bush') {
                advanceCounter(world, event.block, growth.state, growth.max, 1 / 5);
                return;
            }

            const chance = cropGrowthChance(world, event.block);
            if (chance === 0) return;
            advanceCounter(world, event.block, growth.state, growth.max, chance);
        },
        onNeighborChanged: (event, world) => {
            const name = bareName(event.block.identifier);
            if (name === 'cocoa' || name === 'cave_vines' || name === 'nether_wart') return;
            if (stateBoolean(event.block, 'upper_block_bit')) return;
            popWithoutGround(world, event.block, FARMLAND_NAMES);
        },
        onPlayerInteract: (event, world) => {
            const name = bareName(event.block.identifier);
            if (
                name !== 'sweet_berry_bush' &&
                name !== 'cave_vines_head_with_berries' &&
                name !== 'cave_vines_body_with_berries'
            ) {
                return undefined;
            }
            const growth = stateNumber(event.block, 'growth');
            if (name === 'sweet_berry_bush' && growth < 2) return undefined;
            world.dropItem(event.block.position, { identifier: 'minecraft:sweet_berries', count: growth >= 3 ? 3 : 1 });
            setStates(world, event.block, { growth: 1 });
            return true;
        },
        onBreak: (event, world, context) => {
            dropSelf(world, context, event.brokenBlock);
        }
    }
);

/** How tall a grown tree's trunk is, and how wide its canopy reaches. */
export const TREE_TRUNK_HEIGHT = 5;

/**
 * Grows the tree a sapling becomes.
 *
 * The shape is a trunk with a two-layer canopy, which is the oak outline.
 * The real species features live in the feature runtime; this is enough for
 * the sapling's own rule to be observable and tested, and it is the one
 * deliberately provisional piece of this package.
 */
export const growTree = (world: WorldActions, block: HookBlock, species: string): void => {
    const log = sibling(block.identifier, `${species}_log`);
    const leaves = sibling(block.identifier, `${species}_leaves`);

    for (let height = 0; height < TREE_TRUNK_HEIGHT; height += 1) {
        world.setBlock(offset(block.position, 'up', height), log, { pillar_axis: 'y' });
    }
    for (let layer = TREE_TRUNK_HEIGHT - 2; layer <= TREE_TRUNK_HEIGHT; layer += 1) {
        const reach = layer === TREE_TRUNK_HEIGHT ? 0 : 1;
        for (let x = -reach; x <= reach; x += 1) {
            for (let z = -reach; z <= reach; z += 1) {
                const position = {
                    x: block.position.x + x,
                    y: block.position.y + layer,
                    z: block.position.z + z
                };
                const existing = world.getBlock(position);
                if (existing !== undefined && existing.identifier !== AIR) continue;
                world.setBlock(position, leaves, { persistent_bit: false, update_bit: false });
            }
        }
    }
    world.notifyNeighbors(block.position);
};

/** Saplings and the mangrove propagule. */
export const saplingFamily = defineFamily(
    'jsprismarine:sapling',
    'Advances age_bit on a random tick and grows a tree on the next one. The tree shape is provisional until the feature runtime owns it.',
    {
        onRandomTick: (event, world) => {
            if (world.lightLevel(offset(event.block.position, 'up')) < 9) return;
            if (hasState(event.block, 'propagule_stage')) {
                advanceCounter(world, event.block, 'propagule_stage', 4, 1 / 7);
                return;
            }
            if (!stateBoolean(event.block, 'age_bit')) {
                setStates(world, event.block, { age_bit: true });
                return;
            }
            if (world.random() >= 1 / 7) return;
            growTree(world, event.block, bareName(event.block.identifier).replace(/_sapling$/, ''));
        },
        onNeighborChanged: (event, world) => {
            popWithoutGround(world, event.block, SOIL_NAMES);
        },
        onBreak: (event, world, context) => {
            dropSelf(world, context, event.brokenBlock);
        }
    }
);

/** The chance a decaying leaf block drops a sapling. */
export const SAPLING_DROP_CHANCE = 1 / 20;

/** Leaves, which decay when no log is within four blocks. */
export const leavesFamily = defineFamily(
    'jsprismarine:leaves',
    'Decays on a random tick when no log is within four blocks through other leaves, unless persistent_bit is set, and drops a sapling by chance.',
    {
        onNeighborChanged: (event, world) => {
            if (stateBoolean(event.block, 'persistent_bit')) return;
            if (stateBoolean(event.block, 'update_bit')) return;
            setStates(world, event.block, { update_bit: true });
            world.scheduleTick(event.block.position, 1);
        },
        onTick: (event, world) => {
            if (!stateBoolean(event.block, 'update_bit')) return;
            setStates(world, event.block, { update_bit: false });
        },
        onRandomTick: (event, world) => {
            if (stateBoolean(event.block, 'persistent_bit')) return;
            if (hasNearbyLog(world, event.block)) return;

            const species = bareName(event.block.identifier).replace(/_leaves$/, '');
            const drops =
                world.random() < SAPLING_DROP_CHANCE
                    ? [{ identifier: sibling(event.block.identifier, `${species}_sapling`), count: 1 }]
                    : [];
            breakBlock(world, event.block, drops);
        },
        onBreak: (event, world) => {
            // Leaves drop to shears and silk touch only, and the event carries
            // no tool, so the drop decision sits with whoever knows it.
            world.spawnParticle(event.brokenBlock.position, 'minecraft:leaf_particle');
        }
    }
);

/** The one-block plants that need ground under them. */
export const floraFamily = defineFamily(
    'jsprismarine:flora',
    'Pops without soil below, keeps the two halves of a tall plant together, and poisons an entity that steps on a wither rose.',
    {
        onNeighborChanged: (event, world) => {
            if (stateBoolean(event.block, 'upper_block_bit')) {
                const lower = world.getBlock(offset(event.block.position, 'down'));
                if (lower === undefined || lower.identifier !== event.block.identifier) popBlock(world, event.block);
                return;
            }
            if (hasState(event.block, 'upper_block_bit')) {
                const upper = world.getBlock(offset(event.block.position, 'up'));
                if (upper === undefined || upper.identifier !== event.block.identifier) {
                    popBlock(world, event.block);
                    return;
                }
            }
            popWithoutGround(world, event.block, SOIL_NAMES);
        },
        onStepOn: (event, world) => {
            if (bareName(event.block.identifier) !== 'wither_rose') return;
            world.spawnParticle(event.entity.position, 'minecraft:wither_boss_particle');
        },
        onBreak: (event, world, context) => {
            dropSelf(world, context, event.brokenBlock);
        }
    }
);

/** The stalks and the water plants: bamboo, kelp, chorus, coral and sea pickles. */
export const bambooFamily = defineFamily(
    'jsprismarine:bamboo',
    'Grows a stalk upward to its height limit, takes every block above with it when it breaks, and kills coral that is not in water.',
    {
        onRandomTick: (event, world) => {
            const name = bareName(event.block.identifier);
            const limit = MAX_STALK_HEIGHT[name];
            if (limit !== undefined) {
                if (world.random() >= 1 / 16) return;
                growStalk(world, event.block, limit);
                return;
            }
            const growth = growthOf(event.block.identifier);
            advanceCounter(world, event.block, growth.state, growth.max, 1 / 7);
        },
        onNeighborChanged: (event, world) => {
            const name = bareName(event.block.identifier);
            if (name.includes('coral')) {
                const wet = isWater(world.getBlock(offset(event.block.position, 'up'))?.identifier ?? AIR);
                if (!wet && !name.startsWith('dead_')) world.scheduleTick(event.block.position, 60);
                return;
            }
            const below = world.getBlock(offset(event.block.position, 'down'));
            if (below !== undefined && below.identifier === event.block.identifier) return;
            popWithoutGround(world, event.block, SOIL_NAMES);
        },
        onTick: (event, world) => {
            const name = bareName(event.block.identifier);
            if (!name.includes('coral') || name.startsWith('dead_')) return;
            world.setBlock(event.block.position, sibling(event.block.identifier, `dead_${name}`), event.block.states);
        },
        onBreak: (event, world) => {
            let height = 1;
            for (;;) {
                const above = world.getBlock(offset(event.brokenBlock.position, 'up', height));
                if (above === undefined || above.identifier !== event.brokenBlock.identifier) break;
                breakBlock(world, above, [{ identifier: above.identifier, count: 1 }]);
                height += 1;
            }
            world.dropItem(event.brokenBlock.position, { identifier: event.brokenBlock.identifier, count: 1 });
        }
    }
);

/** Ladders, vines, chains, scaffolding and the lichens. */
export const climbingFamily = defineFamily(
    'jsprismarine:climbing',
    'Pops without the face it hangs on, and gives scaffolding its stability distance from the supported block.',
    {
        onPlace: (event, world) => {
            if (!hasState(event.block, 'stability')) return;
            setStates(world, event.block, scaffoldingStates(world, event.block));
        },
        onNeighborChanged: (event, world) => {
            if (hasState(event.block, 'stability')) {
                const states = scaffoldingStates(world, event.block);
                setStates(world, event.block, states);
                if (states['stability'] === 7) world.scheduleTick(event.block.position, 1);
                return;
            }
            if (hasState(event.block, 'facing_direction')) {
                const face = faceOfFacingDirection(stateNumber(event.block, 'facing_direction'));
                if (face !== undefined && face !== 'up' && face !== 'down') {
                    popWithoutSupport(world, event.block, opposite(face));
                    return;
                }
            }
            if (!isSolidSupport(world, offset(event.block.position, 'up'))) popWithoutSupport(world, event.block);
        },
        onTick: (event, world) => {
            if (!hasState(event.block, 'stability')) return;
            if (stateNumber(event.block, 'stability') >= 7) popBlock(world, event.block);
        },
        onBreak: (event, world, context) => {
            dropSelf(world, context, event.brokenBlock);
        }
    }
);

/** The stability distance scaffolding takes from the supported block nearest it. */
export const scaffoldingStates = (world: WorldActions, block: HookBlock): Record<string, number | boolean> => {
    if (isSolidSupport(world, offset(block.position, 'down'))) return { stability: 0, stability_check: false };

    let best = 7;
    for (const face of ['north', 'south', 'west', 'east'] as const) {
        const neighbor = world.getBlock(offset(block.position, face));
        if (neighbor === undefined || neighbor.identifier !== block.identifier) continue;
        best = Math.min(best, stateNumber(neighbor, 'stability') + 1);
    }
    return { stability: Math.min(best, 7), stability_check: best >= 7 };
};

/** The big and small dripleaf, which tilt under a standing entity. */
export const dripleafFamily = defineFamily(
    'jsprismarine:dripleaf',
    'Tilts a big dripleaf a stage per scheduled tick while an entity stands on it, then drops it and resets.',
    {
        onStepOn: (event, world) => {
            if (!hasState(event.block, 'big_dripleaf_tilt')) return;
            setStates(world, event.block, { big_dripleaf_tilt: 'unstable' });
            world.scheduleTick(event.block.position, 10);
        },
        onTick: (event, world) => {
            if (!hasState(event.block, 'big_dripleaf_tilt')) return;
            const tilt = event.block.states['big_dripleaf_tilt'];
            if (tilt === 'unstable') {
                setStates(world, event.block, { big_dripleaf_tilt: 'partial_tilt' });
                world.scheduleTick(event.block.position, 10);
                return;
            }
            if (tilt === 'partial_tilt') {
                setStates(world, event.block, { big_dripleaf_tilt: 'full_tilt' });
                world.scheduleTick(event.block.position, 100);
                return;
            }
            setStates(world, event.block, { big_dripleaf_tilt: 'none' });
        },
        onNeighborChanged: (event, world) => {
            popWithoutSupport(world, event.block);
        }
    }
);

/** Turtle eggs, sniffer eggs and frogspawn. */
export const eggFamily = defineFamily(
    'jsprismarine:egg',
    'Cracks through cracked_state on a random tick and hatches the entity when it is fully cracked.',
    {
        onRandomTick: (event, world) => {
            if (bareName(event.block.identifier) === 'frogspawn') {
                if (world.random() >= 1 / 100) return;
                breakBlock(world, event.block);
                world.spawnEntity(event.block.position, 'minecraft:tadpole');
                return;
            }
            if (!hasState(event.block, 'cracked_state')) return;
            if (world.random() >= 1 / 500) return;

            const cracked = event.block.states['cracked_state'];
            if (cracked === 'no_cracks') {
                setStates(world, event.block, { cracked_state: 'cracked' });
                return;
            }
            if (cracked === 'cracked') {
                setStates(world, event.block, { cracked_state: 'max_cracked' });
                return;
            }

            const hatchling =
                bareName(event.block.identifier) === 'sniffer_egg' ? 'minecraft:sniffer' : 'minecraft:turtle';
            breakBlock(world, event.block);
            world.spawnEntity(event.block.position, hatchling);
        },
        onEntityFallOn: (event, world) => {
            if (bareName(event.block.identifier) !== 'turtle_egg') return;
            if (world.random() >= 1 / 3) return;
            breakBlock(world, event.block);
        }
    }
);
