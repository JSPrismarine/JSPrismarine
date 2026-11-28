/**
 * The families the world itself drives: liquids, the portals and fires, the
 * sculk blocks, and copper weathering.
 */
import type { HookBlock } from '@jsprismarine/blocks';

import { defineFamily } from '../family';
import { offset, opposite } from '../geometry';
import { AIR, isLava } from '../identifiers';
import { fluidNeighborChanged, fluidTick, spreadTicks } from '../rules/fluid';
import { canFireSurvive, fireTick, fireTickDelay } from '../rules/fire';
import { heldName } from '../rules/heldItem';
import { placementFacing } from '../rules/placement';
import {
    activateEndPortal,
    collapseNetherPortal,
    END_PORTAL_FACING_STATE,
    isNetherPortal,
    lightNetherPortal,
    spawnPiglinFromPortal
} from '../rules/portal';
import { breakBlock, MULTI_FACE_STATE, popUnsupportedMultiface } from '../rules/support';
import { bareName, hasState, setStates, sibling, stateBoolean, stateNumber } from '../state';
import type { WorldActions } from '../world';
import { dropSelf, waxOrScrapeHandler, weatherOnRandomTick } from './shared';

const BUBBLE_COLUMN = 'bubble_column';

/** How long Java's `BubbleColumnBlock` waits after a neighbor changes to check the column. */
const BUBBLE_COLUMN_CHECK_TICKS = 5;

const isBubbleColumn = (identifier: string): boolean => bareName(identifier) === BUBBLE_COLUMN;

/** Whether a bubble column above a block drags down, or undefined when the block holds no column. */
const columnDragAbove = (below: HookBlock | undefined): boolean | undefined => {
    if (below === undefined) return undefined;
    switch (bareName(below.identifier)) {
        case BUBBLE_COLUMN:
            return stateBoolean(below, 'drag_down');
        case 'magma':
            return true;
        case 'soul_sand':
            return false;
        default:
            return undefined;
    }
};

/**
 * Java's `BubbleColumnBlock.updateColumn` for one block: soul sand below pushes the column up,
 * a magma block drags it down, more column passes its pull on, and anything else leaves water.
 *
 * @javaSource BubbleColumnBlock.updateColumn(Lnet/minecraft/world/level/block/Block;Lnet/minecraft/world/level/LevelAccessor;Lnet/minecraft/core/BlockPos;Lnet/minecraft/world/level/block/state/BlockState;Lnet/minecraft/world/level/block/state/BlockState;)V
 */
const updateBubbleColumn = (world: WorldActions, block: HookBlock): void => {
    const dragDown = columnDragAbove(world.getBlock(offset(block.position, 'down')));
    if (dragDown === undefined) {
        world.setBlock(block.position, sibling(block.identifier, 'water'));
        return;
    }
    if (stateBoolean(block, 'drag_down') !== dragDown) setStates(world, block, { drag_down: dragDown });
};

/** Water and lava, source and flowing, and the bubble column water holds above soul sand or magma. */
export const liquidFamily = defineFamily(
    'jsprismarine:liquid',
    'Recomputes flowing depth, follows the nearest downward opening, forms source blocks when enabled, reacts where water meets lava, and points a bubble column the way the magma or soul sand below it pulls, or turns it back into water.',
    {
        onPlace: (event, world) => {
            if (isBubbleColumn(event.block.identifier)) {
                world.scheduleTick(event.block.position, BUBBLE_COLUMN_CHECK_TICKS);
                return;
            }
            world.scheduleTick(
                event.block.position,
                spreadTicks(event.block.identifier, event.block.dimension),
                'fluid'
            );
        },
        onNeighborChanged: (event, world) => {
            if (isBubbleColumn(event.block.identifier)) {
                // Java's `BubbleColumnBlock.updateShape` checks the column again 5 ticks after the
                // block below it changes.
                if (event.face === 'down') world.scheduleTick(event.block.position, BUBBLE_COLUMN_CHECK_TICKS);
                return;
            }
            fluidNeighborChanged(world, event.block);
        },
        onTick: (event, world) => {
            if (isBubbleColumn(event.block.identifier)) {
                updateBubbleColumn(world, event.block);
                return;
            }
            fluidTick(world, event.block);
        },
        // A stack lying in lava burns in the entity runtime, at Java's cadence and not at all when
        // it resists fire, so the lava only shows the flame.
        onStepOn: (event, world) => {
            if (!isLava(event.block.identifier)) return;
            world.spawnParticle(event.entity.position, 'minecraft:basic_flame_particle');
        }
        // No random tick: Java's `Fluid.isRandomlyTicking` is false for water, and lava's random
        // tick only spreads fire. Flowing water that lost its source learns it through the
        // neighbor update that removed the source, so a random tick here only restarted flow
        // that had already settled.
    }
);

/** How long a player stands in a nether portal before it moves them, in ticks. */
export const PORTAL_DELAY_TICKS = 80;

/** The portal blocks, the portal frames and the two fires. */
export const portalFamily = defineFamily(
    'jsprismarine:portal',
    'Lights a nether portal when fire appears inside a frame, collapses it when a frame block goes, turns a placed end portal frame opposite its placer, fills a complete end portal ring, rolls the zombified piglin spawn, counts an entity down to a trip, spreads and burns with fire, and ages soul fire. Travel across dimensions is left to the server, which owns the dimension list.',
    {
        onPlace: (event, world) => {
            const name = bareName(event.block.identifier);
            if (name === 'end_portal_frame') {
                // Java's `EndPortalFrameBlock.getStateForPlacement` faces the frame opposite
                // the placer's horizontal direction, so a player standing inside the ring and
                // looking outward leaves every frame facing the center, which is the facing
                // `findEndPortalRing` requires of all twelve.
                if (event.placedBy === undefined) return;
                const facing = placementFacing(event);
                if (facing !== undefined) {
                    setStates(world, event.block, { [END_PORTAL_FACING_STATE]: opposite(facing) });
                }
                return;
            }
            if (name !== 'fire' && name !== 'soul_fire') return;
            world.scheduleTick(event.block.position, fireTickDelay(world));
            // The fire's source does not matter: flint and steel, a fire
            // charge, lightning and spread all arrive here.
            lightNetherPortal(world, event.block.position, event.block.dimension);
        },
        onStepOn: (event, world) => {
            const name = bareName(event.block.identifier);
            if (name !== 'portal' && name !== 'end_portal') return;
            world.scheduleTick(event.block.position, name === 'end_portal' ? 1 : PORTAL_DELAY_TICKS);
        },
        onTick: (event, world) => {
            const name = bareName(event.block.identifier);
            if (name === 'fire') {
                fireTick(world, event.block.position, event.block.dimension);
                return;
            }
            if (name === 'soul_fire') {
                const age = stateNumber(event.block, 'age');
                if (age >= 15) {
                    breakBlock(world, event.block);
                    return;
                }
                setStates(world, event.block, { age: age + 1 });
                world.scheduleTick(event.block.position, 30);
                return;
            }
            for (const entity of world.entitiesAt(event.block.position)) {
                world.spawnParticle(entity.position, 'minecraft:portal_particle');
            }
        },
        onNeighborChanged: (event, world) => {
            const name = bareName(event.block.identifier);
            if (isNetherPortal(event.block.identifier)) {
                collapseNetherPortal(world, event.block, event.face, event.neighbor);
                return;
            }
            if (name !== 'fire' && name !== 'soul_fire') return;
            if (name === 'fire' && canFireSurvive(world, event.block.position)) return;
            const below = world.getBlock(offset(event.block.position, 'down'));
            if (name === 'soul_fire' && below !== undefined && below.identifier !== AIR) return;
            world.setBlock(event.block.position, AIR, {}, false);
            world.notifyNeighbors(event.block.position);
        },
        onRandomTick: (event, world) => {
            if (!isNetherPortal(event.block.identifier)) return;
            spawnPiglinFromPortal(world, event.block);
        },
        onPlayerInteract: (event, world) => {
            if (bareName(event.block.identifier) !== 'end_portal_frame') return undefined;
            if (event.block.states['end_portal_eye_bit'] === true) return undefined;
            // Only a held eye of ender goes into the frame; a bare hand or any other item
            // leaves the click to the next handler.
            if (heldName(event.itemStack) !== 'ender_eye') return undefined;
            setStates(world, event.block, { end_portal_eye_bit: true });
            world.playSound(event.block.position, 'block.end_portal_frame.fill');
            activateEndPortal(world, event.block.position);
            // Java's `EnderEyeItem.useOn` takes one eye off the stack after writing the eye.
            // `WorldActions` reaches no inventory, so the answer reports the cost and the
            // host that dispatched the click charges it, outside creative.
            return { consumed: true, consumesHeldItem: true };
        }
    }
);

/** How far a sculk catalyst spreads its charge. */
export const SCULK_SPREAD_RANGE = 8;

/** The sculk blocks: the catalyst, the shrieker, the sensor and the veins. */
export const sculkFamily = defineFamily(
    'jsprismarine:sculk',
    'Pops a sculk vein once no face it covers is held, runs the shrieker warning, cycles the sensor through its three phases, and gives experience for breaking sculk. The catalyst needs a mob death, which no block hook reports.',
    {
        onNeighborChanged: (event, world) => {
            if (hasState(event.block, MULTI_FACE_STATE)) popUnsupportedMultiface(world, event.block, event.face);
        },
        onStepOn: (event, world) => {
            const name = bareName(event.block.identifier);
            if (name !== 'sculk_shrieker' && name !== 'sculk_sensor' && name !== 'calibrated_sculk_sensor') return;

            if (name === 'sculk_shrieker') {
                // `SculkShriekerBlock.stepOn` shrieks for a player alone, `tryGetPlayer`.
                if (event.entity.identifier !== 'minecraft:player') return;
                if (event.block.states['active'] === true) return;
                setStates(world, event.block, { active: true });
                world.playSound(event.block.position, 'block.sculk_shrieker.shriek');
                world.scheduleTick(event.block.position, 90);
                return;
            }
            // `SculkSensorBlock.stepOn` takes no step from the warden, which it would hunt.
            if (event.entity.identifier === 'minecraft:warden') return;
            if (stateNumber(event.block, 'sculk_sensor_phase') !== 0) return;
            setStates(world, event.block, { sculk_sensor_phase: 1 });
            world.notifyNeighbors(event.block.position);
            world.scheduleTick(event.block.position, 40);
        },
        onTick: (event, world) => {
            const name = bareName(event.block.identifier);
            if (name === 'sculk_shrieker') {
                setStates(world, event.block, { active: false });
                return;
            }
            if (!hasState(event.block, 'sculk_sensor_phase')) return;

            const phase = stateNumber(event.block, 'sculk_sensor_phase');
            if (phase === 1) {
                setStates(world, event.block, { sculk_sensor_phase: 2 });
                world.notifyNeighbors(event.block.position);
                world.scheduleTick(event.block.position, 10);
                return;
            }
            if (phase === 2) {
                setStates(world, event.block, { sculk_sensor_phase: 0 });
                world.notifyNeighbors(event.block.position);
            }
        },
        onBreak: (event, world) => {
            if (bareName(event.brokenBlock.identifier) === 'sculk') {
                if (event.correctTool !== false) {
                    world.spawnEntity(event.brokenBlock.position, 'minecraft:xp_orb', { value: 1 });
                }
                return;
            }
            dropSelf(world, event.brokenBlock);
        }
    }
);

/** The copper blocks that are not a slab, a stair, a door, a trapdoor or bars. */
export const copperFamily = defineFamily(
    'jsprismarine:copper',
    'Waxes with honeycomb, scrapes with an axe, and oxidizes a stage per random tick at the isolated-block rate.',
    {
        onPlayerInteract: waxOrScrapeHandler,
        onRandomTick: (event, world) => {
            weatherOnRandomTick(world, event.block);
        },
        onRedstoneUpdate: (event, world) => {
            if (!hasState(event.block, 'powered_bit')) return;
            const powered = event.power > 0;
            const wasPowered = event.block.states['powered_bit'] === true;
            if (powered === wasPowered) return;
            // A copper bulb is a latch: it flips its light on the rising edge
            // and holds it until the next one.
            const lit = event.block.states['lit'] === true;
            setStates(world, event.block, { powered_bit: powered, lit: powered ? !lit : lit });
        },
        onBreak: (event, world) => {
            dropSelf(world, event.brokenBlock);
        }
    }
);
