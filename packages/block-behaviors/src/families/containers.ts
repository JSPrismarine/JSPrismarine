/**
 * The families that hold something: chests and the other inventories,
 * furnaces, the cauldron, the composter, the flower pot, and the utility
 * blocks that open a screen.
 */
import type { BlockPosition } from '@jsprismarine/blocks';

import { defineFamily } from '../family';
import { HORIZONTAL_FACES, offset, opposite } from '../geometry';
import { placementFacing } from '../rules/placement';
import { isWater } from '../identifiers';
import { emptyContainer, slotsOf, spillContainer } from '../rules/container';
import { fallOneStep, isFallingBlock, scheduleFall } from '../rules/gravity';
import { bucketContents, bucketOf, isEmptyBucket, isGlassBottle, isIgniter, isWaterBottle } from '../rules/heldItem';
import { bareName, hasState, setStates, stateBoolean, stateNumber, stateString } from '../state';
import type { BlockEntityData, WorldActions } from '../world';
import { dropSelf } from './shared';

/**
 * The position a chest's block entity records as its pair, or undefined when
 * it has none. The value comes back out of an open record, so it is checked
 * rather than assumed.
 */
export const pairedPosition = (data: BlockEntityData | undefined): BlockPosition | undefined => {
    const paired = data?.['pairedWith'];
    if (typeof paired !== 'object' || paired === null) return undefined;
    if (!('x' in paired) || !('y' in paired) || !('z' in paired)) return undefined;
    const { x, y, z } = paired;
    if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number') return undefined;
    return { x, y, z };
};

/** The blocks that keep their contents when they are broken. */
const KEEPS_CONTENTS = (identifier: string): boolean => bareName(identifier).endsWith('shulker_box');

/** How many layers a composter takes before it makes bone meal. */
export const COMPOSTER_FULL = 7;

/** The levels a cauldron fills to, which is the top of the `fill_level` domain. */
export const CAULDRON_FULL = 6;

/** How many `fill_level` steps one bottle moves, so three bottles fill a cauldron. */
export const CAULDRON_BOTTLE_LEVELS = 2;

/** The sound each liquid makes going into or out of a cauldron. */
const LIQUID_SOUNDS: Readonly<Record<string, { readonly fill: string; readonly empty: string }>> = {
    water: { fill: 'bucket.fill_water', empty: 'bucket.empty_water' },
    lava: { fill: 'bucket.fill_lava', empty: 'bucket.empty_lava' },
    powder_snow: { fill: 'bucket.fill_powder_snow', empty: 'bucket.empty_powder_snow' }
};

/** The fill and empty sounds for a cauldron liquid, falling back to water's. */
const liquidSounds = (liquid: string): { readonly fill: string; readonly empty: string } =>
    LIQUID_SOUNDS[liquid] ?? { fill: 'bucket.fill_water', empty: 'bucket.empty_water' };

/**
 * Chests, barrels, shulker boxes and decorated pots.
 *
 * Pairing is the one rule a chest decides for itself: a chest placed beside
 * another chest of the same kind and facing joins it into one inventory,
 * which this family records in the block entity of both.
 */
export const containerFamily = defineFamily(
    'jsprismarine:container',
    'Gives a container its block entity, pairs a chest with the chest beside it, spills its contents on break unless it is a shulker box, and marks a barrel open while a player uses it.',
    {
        onPlace: (event, world) => {
            if (event.placedBy !== undefined && hasState(event.block, 'minecraft:cardinal_direction')) {
                // Java's `ChestBlock.getStateForPlacement` opposes the placer's horizontal
                // direction, so the chest faces the player, and the identity state mapping
                // keeps that value in Bedrock's `minecraft:cardinal_direction`. The chests
                // are the family's only blocks with the state; the boxes, the barrel and
                // the decorated pot spell their rotation in other states.
                const facing = placementFacing(event);
                if (facing !== undefined) {
                    setStates(world, event.block, { 'minecraft:cardinal_direction': opposite(facing) });
                }
            }
            world.setBlockData(event.block.position, emptyContainer(event.block.identifier));
            if (!bareName(event.block.identifier).endsWith('chest')) return;

            for (const face of HORIZONTAL_FACES) {
                const partnerPosition = offset(event.block.position, face);
                const partner = world.getBlock(partnerPosition);
                if (partner === undefined || partner.identifier !== event.block.identifier) continue;
                const partnerData = world.getBlockData(partnerPosition);
                if (partnerData?.['pairedWith'] !== undefined) continue;

                world.setBlockData(partnerPosition, { ...partnerData, pairedWith: event.block.position });
                world.setBlockData(event.block.position, {
                    ...emptyContainer(event.block.identifier),
                    pairedWith: partnerPosition
                });
                return;
            }
        },
        onPlayerInteract: (event, world) => {
            if (hasState(event.block, 'open_bit')) {
                setStates(world, event.block, { open_bit: true });
                return true;
            }
            return undefined;
        },
        onBreak: (event, world) => {
            const partner = pairedPosition(world.getBlockData(event.brokenBlock.position));
            if (partner !== undefined) {
                const partnerData = world.getBlockData(partner);
                if (partnerData !== undefined) {
                    world.setBlockData(partner, { ...partnerData, pairedWith: undefined });
                }
            }
            if (KEEPS_CONTENTS(event.brokenBlock.identifier)) {
                // Not spilled and not lost either: the box goes on the ground still holding
                // what was in it, and putting it back down puts the items back in it.
                const held = world.getBlockData(event.brokenBlock.position)?.items ?? [];
                dropSelf(world, event.brokenBlock, 1, held.length === 0 ? {} : { contents: held });
                return;
            }

            spillContainer(world, event.brokenBlock);
            dropSelf(world, event.brokenBlock);
        }
    }
);

/** Furnaces, smokers, blast furnaces, campfires and the brewing stand. */
export const furnaceFamily = defineFamily(
    'jsprismarine:furnace',
    'Gives the block its slots, faces the placer, drops its contents on break, extinguishes a campfire that water reaches, and relights one with flint and steel.',
    {
        onPlayerInteract: (event, world) => {
            if (!hasState(event.block, 'extinguished')) return undefined;
            if (!stateBoolean(event.block, 'extinguished')) return undefined;
            if (!isIgniter(event.itemStack)) return undefined;
            setStates(world, event.block, { extinguished: false });
            world.playSound(event.block.position, 'ignite');
            return true;
        },
        onPlace: (event, world) => {
            if (event.placedBy !== undefined && hasState(event.block, 'minecraft:cardinal_direction')) {
                const facing = placementFacing(event);
                if (facing !== undefined) {
                    // Java's `AbstractFurnaceBlock.getStateForPlacement` opposes the placer's
                    // horizontal direction, so the mouth faces the player. A campfire keeps
                    // the placer's own: `CampfireBlock` writes it unopposed, which lays the
                    // logs the way the placer looks.
                    const cardinal = bareName(event.block.identifier).endsWith('campfire') ? facing : opposite(facing);
                    setStates(world, event.block, { 'minecraft:cardinal_direction': cardinal });
                }
            }
            world.setBlockData(event.block.position, emptyContainer(event.block.identifier));
        },
        onNeighborChanged: (event, world) => {
            if (!hasState(event.block, 'extinguished')) return;
            // A campfire that is already out has nothing left to put out. Without this, every
            // neighbor change reaching a drowned campfire played the fizz again, so one under
            // water hissed at anything that moved near it.
            if (stateBoolean(event.block, 'extinguished')) return;

            const above = world.getBlock(offset(event.block.position, 'up'));
            if (above === undefined || !isWater(above.identifier)) return;
            setStates(world, event.block, { extinguished: true });
            world.playSound(event.block.position, 'random.fizz');
        },
        onStepOn: (event, world) => {
            if (!hasState(event.block, 'extinguished')) return;
            if (event.block.states['extinguished'] === true) return;
            world.spawnParticle(event.entity.position, 'minecraft:campfire_smoke_particle');
        },
        onBreak: (event, world) => {
            spillContainer(world, event.brokenBlock);
            dropSelf(world, event.brokenBlock);
        }
    }
);

/**
 * The cauldron, which holds one of three liquids.
 *
 * A bucket moves the whole six levels and a bottle moves two, so three
 * bottles fill what one bucket does. What the exchange gives back goes on the
 * ground, because `WorldActions` has no inventory to put it in; the server
 * picks it up from the drop or replaces the stack itself.
 */
export const cauldronFamily = defineFamily(
    'jsprismarine:cauldron',
    'Takes a whole bucket or two levels from a bottle, gives back the emptied or filled container, and refuses a bottle against lava or powder snow.',
    {
        onPlayerInteract: (event, world) => {
            const level = stateNumber(event.block, 'fill_level');
            const liquid = stateString(event.block, 'cauldron_liquid', 'water');
            const poured = bucketContents(event.itemStack);

            if (poured !== undefined) {
                if (level >= CAULDRON_FULL) return undefined;
                setStates(world, event.block, { fill_level: CAULDRON_FULL, cauldron_liquid: poured });
                world.dropItem(event.block.position, { identifier: 'minecraft:bucket', count: 1 });
                world.playSound(event.block.position, liquidSounds(poured).empty);
                return true;
            }

            if (isEmptyBucket(event.itemStack)) {
                if (level < CAULDRON_FULL) return undefined;
                setStates(world, event.block, { fill_level: 0 });
                world.dropItem(event.block.position, { identifier: bucketOf(liquid), count: 1 });
                world.playSound(event.block.position, liquidSounds(liquid).fill);
                return true;
            }

            // A bottle only ever carries water, so lava and powder snow are
            // left for the item's own use rather than drained two at a time.
            if (liquid !== 'water') return undefined;

            if (isGlassBottle(event.itemStack)) {
                if (level < CAULDRON_BOTTLE_LEVELS) return undefined;
                setStates(world, event.block, { fill_level: level - CAULDRON_BOTTLE_LEVELS });
                world.dropItem(event.block.position, { identifier: 'minecraft:potion', count: 1 });
                world.playSound(event.block.position, 'bucket.fill_water');
                return true;
            }

            if (isWaterBottle(event.itemStack)) {
                if (level > CAULDRON_FULL - CAULDRON_BOTTLE_LEVELS) return undefined;
                setStates(world, event.block, {
                    fill_level: level + CAULDRON_BOTTLE_LEVELS,
                    cauldron_liquid: 'water'
                });
                world.dropItem(event.block.position, { identifier: 'minecraft:glass_bottle', count: 1 });
                world.playSound(event.block.position, 'bucket.empty_water');
                return true;
            }

            return undefined;
        },
        onBreak: (event, world) => {
            dropSelf(world, event.brokenBlock);
        }
    }
);

/** The composter, which turns a stack of plant matter into bone meal. */
export const composterFamily = defineFamily(
    'jsprismarine:composter',
    'Adds a layer per use and gives back bone meal at the eighth, which is the level Java calls full.',
    {
        onPlayerInteract: (event, world) => {
            const level = stateNumber(event.block, 'composter_fill_level');
            if (level > COMPOSTER_FULL) {
                setStates(world, event.block, { composter_fill_level: 0 });
                world.dropItem(event.block.position, { identifier: 'minecraft:bone_meal', count: 1 });
                world.playSound(event.block.position, 'block.composter.empty');
                return true;
            }
            setStates(world, event.block, { composter_fill_level: level + 1 });
            world.playSound(event.block.position, 'block.composter.fill');
            return true;
        }
    }
);

/**
 * The flower pot, which holds one plant.
 *
 * `update_bit` says whether the pot has contents: `false` is an empty pot. Taking the
 * plant out therefore clears it. It used to set it, which left an emptied pot claiming
 * to be full and put a `minecraft:flower_pot[update_bit=1]` on the wire, a state the
 * Java-to-Bedrock table never emits. All 40 Java `potted_*` blocks and the empty
 * `minecraft:flower_pot` collapse onto `update_bit=0`, because the plant travels in the
 * block entity rather than in the state.
 */
export const flowerPotFamily = defineFamily(
    'jsprismarine:flower_pot',
    'Swaps the plant it holds on use and drops it on break; which plants fit is the item runtime decision.',
    {
        onPlayerInteract: (event, world) => {
            const data = world.getBlockData(event.block.position);
            const held = data?.items?.[0];
            if (held !== undefined) {
                world.dropItem(event.block.position, held);
                world.setBlockData(event.block.position, { items: [undefined], capacity: 1 });
                setStates(world, event.block, { update_bit: false });
                return true;
            }
            return undefined;
        },
        onBreak: (event, world) => {
            spillContainer(world, event.brokenBlock);
            dropSelf(world, event.brokenBlock);
        }
    }
);

/** The blocks a beacon pyramid is built from. */
export const BEACON_BASE_NAMES: ReadonlySet<string> = new Set([
    'iron_block',
    'gold_block',
    'emerald_block',
    'diamond_block',
    'netherite_block'
]);

/** How many levels of pyramid sit under a beacon. */
export const beaconLevels = (world: WorldActions, position: BlockPosition): number => {
    let levels = 0;
    for (let level = 1; level <= 4; level += 1) {
        let complete = true;
        for (let x = -level; x <= level && complete; x += 1) {
            for (let z = -level; z <= level && complete; z += 1) {
                const block = world.getBlock({ x: position.x + x, y: position.y - level, z: position.z + z });
                if (block === undefined || !BEACON_BASE_NAMES.has(bareName(block.identifier))) complete = false;
            }
        }
        if (!complete) break;
        levels = level;
    }
    return levels;
};

/**
 * The workstations, the beacon, the conduit, the spawners and the sticky and
 * damaging blocks.
 *
 * Forty-seven blocks with little in common, so the family answers the ones
 * whose rule is a block rule: the beacon's pyramid, the anvil's fall, the
 * spawner's timer and the blocks that hurt what stands on them.
 */
export const utilityFamily = defineFamily(
    'jsprismarine:utility',
    'Counts a beacon pyramid, falls when it is an anvil, runs the spawner timer, and hurts an entity standing on magma. The screens the workstations open belong to the item runtime.',
    {
        onPlace: (event, world) => {
            if (isFallingBlock(event.block.identifier)) scheduleFall(world, event.block);
            if (bareName(event.block.identifier) === 'beacon') {
                world.setBlockData(event.block.position, { levels: beaconLevels(world, event.block.position) });
            }
        },
        onNeighborChanged: (event, world) => {
            if (isFallingBlock(event.block.identifier)) {
                scheduleFall(world, event.block);
                return;
            }
            if (bareName(event.block.identifier) !== 'beacon') return;
            world.setBlockData(event.block.position, { levels: beaconLevels(world, event.block.position) });
        },
        onTick: (event, world) => {
            if (isFallingBlock(event.block.identifier)) {
                fallOneStep(world, event.block);
                return;
            }
            if (bareName(event.block.identifier) !== 'mob_spawner') return;
            const data = world.getBlockData(event.block.position);
            const entity = typeof data?.['entity'] === 'string' ? data['entity'] : 'minecraft:pig';
            world.spawnEntity(offset(event.block.position, 'up'), entity);
            world.scheduleTick(event.block.position, 200 + Math.floor(world.random() * 600));
        },
        onStepOn: (event, world) => {
            if (bareName(event.block.identifier) !== 'magma') return;
            world.spawnParticle(event.entity.position, 'minecraft:basic_flame_particle');
        },
        onEntityFallOn: (event, world) => {
            if (!isFallingBlock(event.block.identifier)) return;
            if (event.fallDistance < 1) return;
            world.playSound(event.block.position, 'random.anvil_land');
        },
        onBreak: (event, world) => {
            if (slotsOf(event.brokenBlock.identifier) > 0) spillContainer(world, event.brokenBlock);
            dropSelf(world, event.brokenBlock);
        }
    }
);
