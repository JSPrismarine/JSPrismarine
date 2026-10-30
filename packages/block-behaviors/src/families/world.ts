/**
 * The families the world itself drives: liquids, the portals and fires, the
 * sculk blocks, and copper weathering.
 */
import { defineFamily } from '../family';
import { offset } from '../geometry';
import { AIR, isLava, isLiquidSource } from '../identifiers';
import { fluidNeighborChanged, fluidTick, spreadTicks } from '../rules/fluid';
import { canFireSurvive, fireTick, fireTickDelay } from '../rules/fire';
import { bucketOf, isEmptyBucket, isGlassBottle } from '../rules/heldItem';
import { collapseNetherPortal, isNetherPortal, lightNetherPortal } from '../rules/portal';
import { breakBlock } from '../rules/support';
import { bareName, hasState, setStates, stateNumber } from '../state';
import { dropSelf, waxOrScrapeHandler, weatherOnRandomTick } from './shared';

/** Water and lava, source and flowing. */
export const liquidFamily = defineFamily(
    'jsprismarine:liquid',
    'Recomputes flowing depth, follows the nearest downward opening, forms source blocks when enabled, reacts where water meets lava, and gives sources up to buckets or bottles.',
    {
        onPlayerInteract: (event, world) => {
            // Only a source fills a bucket. A flowing block has no liquid of
            // its own to give, which is why an infinite water source is two
            // sources and not two flows.
            if (!isLiquidSource(event.block.identifier)) return undefined;
            const liquid = isLava(event.block.identifier) ? 'lava' : 'water';

            if (isEmptyBucket(event.itemStack)) {
                world.setBlock(event.block.position, AIR);
                world.dropItem(event.block.position, { identifier: bucketOf(liquid), count: 1 });
                world.playSound(event.block.position, `bucket.fill_${liquid}`);
                world.notifyNeighbors(event.block.position);
                return true;
            }

            if (liquid === 'water' && isGlassBottle(event.itemStack)) {
                // A bottle scoops water without taking the source with it.
                world.dropItem(event.block.position, { identifier: 'minecraft:potion', count: 1 });
                world.playSound(event.block.position, 'bucket.fill_water');
                return true;
            }

            return undefined;
        },
        onPlace: (event, world) => {
            world.scheduleTick(
                event.block.position,
                spreadTicks(event.block.identifier, event.block.dimension),
                'fluid'
            );
        },
        onNeighborChanged: (event, world) => {
            fluidNeighborChanged(world, event.block);
        },
        onTick: (event, world) => {
            fluidTick(world, event.block);
        },
        onStepOn: (event, world) => {
            if (!isLava(event.block.identifier)) return;
            for (const entity of world.entitiesAt(event.block.position)) {
                if (entity.identifier !== 'minecraft:item') continue;
                world.removeEntity(entity.id);
            }
            world.spawnParticle(event.entity.position, 'minecraft:basic_flame_particle');
        },
        onRandomTick: (event, world) => {
            // A source block never dries up; a flowing one that lost its
            // source does, which the spread check reports as nothing moving.
            if (isLiquidSource(event.block.identifier)) return;
            if (stateNumber(event.block, 'liquid_depth') === 0) return;
            world.scheduleTick(
                event.block.position,
                spreadTicks(event.block.identifier, event.block.dimension),
                'fluid'
            );
        }
    }
);

/** How long a player stands in a nether portal before it moves them, in ticks. */
export const PORTAL_DELAY_TICKS = 80;

/** The portal blocks, the portal frames and the two fires. */
export const portalFamily = defineFamily(
    'jsprismarine:portal',
    'Counts an entity down to a nether portal trip, spreads and burns with fire, ages soul fire, and fills an end portal frame. The destination search across dimensions is left to the server, which owns the dimension list.',
    {
        onPlace: (event, world) => {
            const name = bareName(event.block.identifier);
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
        onPlayerInteract: (event, world) => {
            if (bareName(event.block.identifier) !== 'end_portal_frame') return undefined;
            if (event.block.states['end_portal_eye_bit'] === true) return undefined;
            setStates(world, event.block, { end_portal_eye_bit: true });
            world.playSound(event.block.position, 'block.end_portal_frame.fill');
            return true;
        }
    }
);

/** How far a sculk catalyst spreads its charge. */
export const SCULK_SPREAD_RANGE = 8;

/** The sculk blocks: the catalyst, the shrieker, the sensor and the veins. */
export const sculkFamily = defineFamily(
    'jsprismarine:sculk',
    'Runs the shrieker warning, cycles the sensor through its three phases, and gives experience for breaking sculk. The catalyst needs a mob death, which no block hook reports.',
    {
        onStepOn: (event, world) => {
            const name = bareName(event.block.identifier);
            if (name !== 'sculk_shrieker' && name !== 'sculk_sensor' && name !== 'calibrated_sculk_sensor') return;

            if (name === 'sculk_shrieker') {
                if (event.block.states['active'] === true) return;
                setStates(world, event.block, { active: true });
                world.playSound(event.block.position, 'block.sculk_shrieker.shriek');
                world.scheduleTick(event.block.position, 90);
                return;
            }
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
