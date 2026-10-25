/**
 * The families the world itself drives: liquids, the portals and fires, the
 * sculk blocks, and copper weathering.
 */
import { defineFamily } from '../family';
import { offset } from '../geometry';
import { AIR, isLava, isLiquidSource } from '../identifiers';
import { applyLavaWaterReaction, spreadLiquid, spreadTicks } from '../rules/fluid';
import { breakBlock } from '../rules/support';
import { bareName, hasState, setStates, stateNumber } from '../state';
import { dropSelf, weatherOnRandomTick } from './shared';

/** Water and lava, source and flowing. */
export const liquidFamily = defineFamily(
    'jsprismarine:liquid',
    'Spreads on a scheduled tick at the rate its dimension sets, turns to rock where water meets lava, and burns what stands in lava.',
    {
        onPlace: (event, world) => {
            world.scheduleTick(event.block.position, spreadTicks(event.block.identifier, event.block.dimension));
        },
        onNeighborChanged: (event, world) => {
            if (applyLavaWaterReaction(world, event.block) !== undefined) return;
            world.scheduleTick(event.block.position, spreadTicks(event.block.identifier, event.block.dimension));
        },
        onTick: (event, world) => {
            if (applyLavaWaterReaction(world, event.block) !== undefined) return;
            const result = spreadLiquid(world, event.block);
            if (!result.down && result.sides.length === 0) return;
            world.scheduleTick(event.block.position, spreadTicks(event.block.identifier, event.block.dimension));
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
            world.scheduleTick(event.block.position, spreadTicks(event.block.identifier, event.block.dimension));
        }
    }
);

/** How long a player stands in a nether portal before it moves them, in ticks. */
export const PORTAL_DELAY_TICKS = 80;

/** The portal blocks, the portal frames and the two fires. */
export const portalFamily = defineFamily(
    'jsprismarine:portal',
    'Counts an entity down to a nether portal trip and spreads fire to what burns. The destination search across dimensions is left to the server, which owns the dimension list.',
    {
        onStepOn: (event, world) => {
            const name = bareName(event.block.identifier);
            if (name !== 'portal' && name !== 'end_portal') return;
            world.scheduleTick(event.block.position, name === 'end_portal' ? 1 : PORTAL_DELAY_TICKS);
        },
        onTick: (event, world) => {
            const name = bareName(event.block.identifier);
            if (name === 'fire' || name === 'soul_fire') {
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
            if (name !== 'fire' && name !== 'soul_fire') return;
            const below = world.getBlock(offset(event.block.position, 'down'));
            if (below !== undefined && below.identifier !== AIR) return;
            breakBlock(world, event.block);
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
    'Blooms a catalyst and lays sculk under a death nearby, runs the shrieker warning, and cycles the sensor through its three phases.',
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
        onBreak: (event, world, context) => {
            if (bareName(event.brokenBlock.identifier) === 'sculk') {
                world.spawnEntity(event.brokenBlock.position, 'minecraft:xp_orb', { value: 1 });
                return;
            }
            dropSelf(world, context, event.brokenBlock);
        }
    }
);

/** The copper blocks that are not a slab, a stair, a door, a trapdoor or bars. */
export const copperFamily = defineFamily(
    'jsprismarine:copper',
    'Oxidizes a stage per random tick at the isolated-block rate. Waxing and scraping need the held item, which no block hook carries, so they are exported as transitions for the item runtime.',
    {
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
        onBreak: (event, world, context) => {
            dropSelf(world, context, event.brokenBlock);
        }
    }
);
