/**
 * Everything that grows: crops, saplings, leaves, flowers, the segmented
 * plants, the climbing blocks, the dripleaves and the eggs.
 */
import type { BlockFace, HookBlock } from '@jsprismarine/blocks';

import { defineFamily } from '../family';
import { faceOfFacingDirection, offset, opposite } from '../geometry';
import type { HorizontalFace } from '../geometry';
import { AIR, isWater } from '../identifiers';
import {
    advanceCounter,
    cropGrowthChance,
    FARMLAND_NAMES,
    hasNearbyLog,
    MAX_CROP_GROWTH,
    SOIL_NAMES
} from '../rules/growth';
import { cutsCleanly } from '../rules/heldItem';
import { breakBlock, isSolidSupport, popBlock, popWithoutGround, popWithoutSupport } from '../rules/support';
import { bareName, hasState, setStates, sibling, stateBoolean, stateNumber } from '../state';
import type { WorldActions } from '../world';
import { dropSelf, selfDrop } from './shared';

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

/** Bedrock's cave-vine identifiers, which share Java's hanging vine support rule. */
const CAVE_VINE_NAMES: ReadonlySet<string> = new Set([
    'cave_vines',
    'cave_vines_body_with_berries',
    'cave_vines_head_with_berries'
]);

type FaceBit = { readonly face: BlockFace; readonly bit: number };

/** The side directions Bedrock packs into `vine_direction_bits`. */
const VINE_FACE_BITS = [
    { face: 'south', bit: 1 },
    { face: 'west', bit: 2 },
    { face: 'north', bit: 4 },
    { face: 'east', bit: 8 }
] as const satisfies readonly { readonly face: HorizontalFace; readonly bit: number }[];

/** The six faces Bedrock packs into `multi_face_direction_bits`. */
const MULTI_FACE_BITS = [
    { face: 'down', bit: 1 },
    { face: 'up', bit: 2 },
    { face: 'north', bit: 4 },
    { face: 'south', bit: 8 },
    { face: 'west', bit: 16 },
    { face: 'east', bit: 32 }
] as const satisfies readonly FaceBit[];

const DRY_VEGETATION_FALLBACK_NAMES: ReadonlySet<string> = new Set([...SOIL_NAMES, 'sand', 'red_sand', 'terracotta']);
const CACTUS_SUPPORT_FALLBACK_NAMES: ReadonlySet<string> = new Set(['cactus', 'sand', 'red_sand']);
const SUGAR_CANE_SUPPORT_FALLBACK_NAMES: ReadonlySet<string> = new Set([...SOIL_NAMES, 'sand', 'red_sand']);
const WITHER_ROSE_SUPPORT_FALLBACK_NAMES: ReadonlySet<string> = new Set([...SOIL_NAMES, 'netherrack', 'soul_sand']);

/** Plant-specific Java support tags that differ from ordinary vegetation. */
const PLANT_SUPPORT_TAGS: Readonly<Record<string, string>> = {
    deadbush: 'minecraft:supports_dry_vegetation',
    dead_bush: 'minecraft:supports_dry_vegetation',
    cactus: 'minecraft:supports_cactus',
    reeds: 'minecraft:supports_sugar_cane',
    sugar_cane: 'minecraft:supports_sugar_cane',
    lily_pad: 'minecraft:supports_lily_pad',
    azalea: 'minecraft:supports_azalea',
    flowering_azalea: 'minecraft:supports_azalea',
    mangrove_propagule: 'minecraft:supports_mangrove_propagule',
    wither_rose: 'minecraft:supports_wither_rose'
};

/** Whether a block is a valid substrate for the plant at `block`. */
const hasPlantSupport = (world: WorldActions, block: HookBlock): boolean => {
    const below = world.getBlock(offset(block.position, 'down'));
    if (below === undefined) return false;

    const name = bareName(block.identifier);
    const tag = PLANT_SUPPORT_TAGS[name] ?? 'minecraft:supports_vegetation';
    if (world.hasBlockTag !== undefined) return world.hasBlockTag(below, tag);

    const groundName = bareName(below.identifier);
    switch (tag) {
        case 'minecraft:supports_dry_vegetation':
            return (
                DRY_VEGETATION_FALLBACK_NAMES.has(groundName) ||
                (groundName.endsWith('_terracotta') && !groundName.endsWith('_glazed_terracotta'))
            );
        case 'minecraft:supports_cactus':
            return CACTUS_SUPPORT_FALLBACK_NAMES.has(groundName);
        case 'minecraft:supports_sugar_cane':
            return SUGAR_CANE_SUPPORT_FALLBACK_NAMES.has(groundName);
        case 'minecraft:supports_lily_pad':
            return isWater(below.identifier);
        case 'minecraft:supports_wither_rose':
            return WITHER_ROSE_SUPPORT_FALLBACK_NAMES.has(groundName);
        default:
            return SOIL_NAMES.has(groundName);
    }
};

/** Whether one of a block's flagged faces still touches a supporting block. */
const hasSupportedAttachment = (
    world: WorldActions,
    block: HookBlock,
    state: string,
    faces: readonly FaceBit[]
): boolean => {
    const bits = stateNumber(block, state);
    return faces.some(({ face, bit }) => (bits & bit) !== 0 && isSolidSupport(world, offset(block.position, face)));
};

const growthOf = (identifier: string): { readonly state: string; readonly max: number } =>
    GROWTH_STATES[bareName(identifier)] ?? { state: 'growth', max: MAX_CROP_GROWTH };

/** How many blocks a stalk of sugar cane, cactus or bamboo grows to. */
export const MAX_STALK_HEIGHT: Readonly<Record<string, number>> = { reeds: 3, cactus: 3, bamboo: 16 };

/** Grows a stalk upward by one when its counter wraps, which is how reeds and cactus work. */
const growStalk = (world: WorldActions, block: HookBlock, maxHeight: number, growthState: string): boolean => {
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

    world.setBlock(above, block.identifier, { ...block.states, [growthState]: 0 });
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
            if (CAVE_VINE_NAMES.has(name)) {
                if (event.face !== 'up') return;
                const above = world.getBlock(offset(event.block.position, 'up'));
                if (above === undefined || CAVE_VINE_NAMES.has(bareName(above.identifier))) return;
                popWithoutSupport(world, event.block, 'up');
                return;
            }
            if (name === 'sweet_berry_bush') {
                if (event.face === 'down' && !hasPlantSupport(world, event.block)) popBlock(world, event.block);
                return;
            }
            if (name === 'cocoa' || name === 'nether_wart') return;
            if (event.face !== 'down') return;
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
        onBreak: (event, world) => {
            dropSelf(world, event.brokenBlock);
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
            if (event.face === 'down' && !hasPlantSupport(world, event.block)) popBlock(world, event.block);
        },
        onBreak: (event, world) => {
            dropSelf(world, event.brokenBlock);
        }
    }
);

/** The chance a decaying leaf block drops a sapling. */
export const SAPLING_DROP_CHANCE = 1 / 20;

/**
 * Leaves, which decay when no log is within six blocks and come away to shears.
 *
 * No `onNeighborChanged`, deliberately. Java recomputes a leaf's `distance` state when a
 * neighbor changes, and Bedrock's `update_bit` is the engine's own marker for the same
 * check. This server has neither: {@link hasNearbyLog} walks the canopy from scratch on
 * every random tick, so nothing reads a scheduling flag back. Writing one cost two block
 * writes per leaf per tick forever - the clearing write notified the six neighbors, each
 * un-flagged leaf flagged itself again, and the canopy never settled - and every write
 * carried a block-change packet, a light update, seven scheduled physics positions and six
 * more neighbor notifications. Leaving the hook off also keeps leaves out of the neighbor
 * walk entirely, because the adapter skips a block whose families declare no reaction.
 */
export const leavesFamily = defineFamily(
    'jsprismarine:leaves',
    'Decays on a random tick when no log is within six blocks through other leaves, unless persistent_bit is set, drops a sapling by chance, and drops itself to shears or silk touch.',
    {
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
            // Leaves come away whole to shears or silk touch; anything else
            // shreds them and the random sapling is the loot table's job.
            if (cutsCleanly(event.itemStack)) {
                world.dropItem(event.brokenBlock.position, selfDrop(event.brokenBlock));
                return;
            }
            world.spawnParticle(event.brokenBlock.position, 'minecraft:leaf_particle');
        }
    }
);

/** The one-block plants that need ground under them. */
export const floraFamily = defineFamily(
    'jsprismarine:flora',
    'Pops without soil below, keeps the two halves of a tall plant together, and marks an entity that walks into a wither rose. The effect itself is the entity runtime.',
    {
        onNeighborChanged: (event, world) => {
            if (stateBoolean(event.block, 'upper_block_bit')) {
                if (event.face !== 'down') return;
                const lower = world.getBlock(offset(event.block.position, 'down'));
                if (lower === undefined || lower.identifier !== event.block.identifier) popBlock(world, event.block);
                return;
            }
            if (hasState(event.block, 'upper_block_bit')) {
                if (event.face !== 'up') {
                    if (event.face === 'down' && !hasPlantSupport(world, event.block)) popBlock(world, event.block);
                    return;
                }
                const upper = world.getBlock(offset(event.block.position, 'up'));
                if (upper === undefined || upper.identifier !== event.block.identifier) {
                    popBlock(world, event.block);
                    return;
                }
                return;
            }
            if (event.face === 'down' && !hasPlantSupport(world, event.block)) popBlock(world, event.block);
        },
        onStepOn: (event, world) => {
            if (bareName(event.block.identifier) !== 'wither_rose') return;
            world.spawnParticle(event.entity.position, 'minecraft:wither_boss_particle');
        },
        onBreak: (event, world) => {
            dropSelf(world, event.brokenBlock);
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
            const growth = growthOf(event.block.identifier);
            const limit = MAX_STALK_HEIGHT[name];
            if (limit !== undefined) {
                if (world.random() >= 1 / 16) return;
                growStalk(world, event.block, limit, growth.state);
                return;
            }
            advanceCounter(world, event.block, growth.state, growth.max, 1 / 7);
        },
        onNeighborChanged: (event, world) => {
            const name = bareName(event.block.identifier);
            if (name.includes('coral')) {
                if (event.face !== 'up') return;
                const wet = isWater(world.getBlock(offset(event.block.position, 'up'))?.identifier ?? AIR);
                if (!wet && !name.startsWith('dead_')) world.scheduleTick(event.block.position, 60);
                return;
            }
            if (event.face !== 'down') return;
            const below = world.getBlock(offset(event.block.position, 'down'));
            if (below !== undefined && below.identifier === event.block.identifier) return;
            if (name === 'kelp') {
                const supported =
                    below !== undefined && (world.hasSturdyTopFace?.(below) ?? isSolidSupport(world, below.position));
                if (!supported) popBlock(world, event.block);
                return;
            }
            if (name === 'bamboo') {
                const supported =
                    below !== undefined &&
                    (world.hasBlockTag?.(below, 'minecraft:supports_bamboo') ??
                        SOIL_NAMES.has(bareName(below.identifier)));
                if (!supported) popBlock(world, event.block);
                return;
            }
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

/**
 * The blocks in {@link climbingFamily} that come away only to shears or silk
 * touch. The rest of the family, the ladders, chains and scaffolding, drops
 * to a bare hand.
 */
export const SHEARED_CLIMBERS: ReadonlySet<string> = new Set([
    'vine',
    'glow_lichen',
    'hanging_roots',
    'resin_clump',
    'leaf_litter',
    'wildflowers'
]);

/** Ladders, vines, chains, scaffolding and the lichens. */
export const climbingFamily = defineFamily(
    'jsprismarine:climbing',
    'Pops without the face it hangs on, gives scaffolding its stability distance from the supported block, and holds a vine or a lichen back from anything but shears.',
    {
        onPlace: (event, world) => {
            if (!hasState(event.block, 'stability')) return;
            setStates(world, event.block, scaffoldingStates(world, event.block));
        },
        onNeighborChanged: (event, world) => {
            const name = bareName(event.block.identifier);
            if (hasState(event.block, 'stability')) {
                const states = scaffoldingStates(world, event.block);
                setStates(world, event.block, states);
                if (states['stability'] === 7) world.scheduleTick(event.block.position, 1);
                return;
            }
            if (name === 'vine') {
                const sideBit = VINE_FACE_BITS.find(({ face }) => face === event.face)?.bit;
                if (
                    event.face !== 'up' &&
                    (sideBit === undefined || (stateNumber(event.block, 'vine_direction_bits') & sideBit) === 0)
                ) {
                    return;
                }
                if (!hasSupportedAttachment(world, event.block, 'vine_direction_bits', VINE_FACE_BITS)) {
                    popWithoutSupport(world, event.block, 'up');
                }
                return;
            }
            if (hasState(event.block, 'multi_face_direction_bits')) {
                const faceBit = MULTI_FACE_BITS.find(({ face }) => face === event.face)?.bit;
                if (faceBit === undefined || (stateNumber(event.block, 'multi_face_direction_bits') & faceBit) === 0) {
                    return;
                }
                if (!hasSupportedAttachment(world, event.block, 'multi_face_direction_bits', MULTI_FACE_BITS)) {
                    popBlock(world, event.block);
                }
                return;
            }
            if (name === 'wildflowers') {
                if (event.face === 'down' && !hasPlantSupport(world, event.block)) popBlock(world, event.block);
                return;
            }
            if (name === 'leaf_litter') {
                if (event.face !== 'down') return;
                const below = world.getBlock(offset(event.block.position, 'down'));
                const supported =
                    below !== undefined && (world.hasSturdyTopFace?.(below) ?? isSolidSupport(world, below.position));
                if (!supported) popBlock(world, event.block);
                return;
            }
            if (hasState(event.block, 'facing_direction')) {
                const face = faceOfFacingDirection(stateNumber(event.block, 'facing_direction'));
                if (face !== undefined) {
                    const supportFace = opposite(face);
                    if (face !== 'up' && face !== 'down' && event.face === supportFace) {
                        popWithoutSupport(world, event.block, supportFace);
                    }
                    return;
                }
            }
            if (name === 'chain') {
                const axis = event.block.states['pillar_axis'];
                const supportFaces: readonly BlockFace[] =
                    axis === 'x' ? ['west', 'east'] : axis === 'z' ? ['north', 'south'] : ['down', 'up'];
                if (!supportFaces.includes(event.face)) return;
                if (!supportFaces.some((face) => isSolidSupport(world, offset(event.block.position, face)))) {
                    popBlock(world, event.block);
                }
                return;
            }
            if (name === 'hanging_roots') {
                if (event.face === 'up') popWithoutSupport(world, event.block, 'up');
                return;
            }
            if (event.face === 'up') popWithoutSupport(world, event.block, 'up');
        },
        onTick: (event, world) => {
            if (!hasState(event.block, 'stability')) return;
            if (stateNumber(event.block, 'stability') >= 7) popBlock(world, event.block);
        },
        onBreak: (event, world) => {
            const name = bareName(event.brokenBlock.identifier);
            if (SHEARED_CLIMBERS.has(name) && !cutsCleanly(event.itemStack)) return;
            dropSelf(world, event.brokenBlock);
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
            if (bareName(event.block.identifier) === 'spore_blossom') {
                if (event.face === 'up') popWithoutSupport(world, event.block, 'up');
                return;
            }
            if (event.face === 'down') popWithoutSupport(world, event.block);
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
