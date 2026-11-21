/**
 * The `block-liquid-flow` scenario: `Block.liquidCanFlowFromDirection` for blocks of many shapes,
 * full cubes, slabs, stairs, trapdoors, doors, fences, panes and thin blocks, for water from each
 * of the six directions and for lava from above and below, in the flat world. Everything runs
 * once the chunk at the origin has loaded.
 *
 * `packages/parity/src/scripting/record.ts` defines the format.
 */

import { BlockPermutation, Direction, LiquidType, system, world } from '@minecraft/server';

const PACK = 'flow';
let seq = 0;
let start = 0;

/** Logs one observation, stamped with the pack's sequence number and the tick since the chunks loaded. */
const record = (event, observed = {}) => {
    seq += 1;
    console.warn(
        `DUMP record ${JSON.stringify({ pack: PACK, seq, tick: system.currentTick - start, event, ...observed })}`
    );
};

/** Logs what a call returned, or what it threw. */
const attempt = (event, call) => {
    try {
        record(event, { value: call() });
    } catch (error) {
        record(event, { error: String(error) });
    }
};

/** Runs `run` once the chunk at the origin is loaded, after a ticking area over it. */
const whenLoaded = (run) => {
    world.afterEvents.worldLoad.subscribe(() => {
        const overworld = world.getDimension('overworld');
        try {
            overworld.runCommand('tickingarea add -16 0 -16 15 0 15 jsp_scenario');
        } catch {
            // A world that loads its spawn chunks without one may refuse it.
        }
        const waiting = system.runInterval(() => {
            let loaded = false;
            try {
                loaded = overworld.getBlock({ x: 0, y: -61, z: 0 }) !== undefined;
            } catch {
                // Not loaded yet.
            }
            if (!loaded) return;
            system.clearRun(waiting);
            start = system.currentTick;
            run(overworld);
        }, 1);
    });
};

/** The directions water is asked about, in this order in every answer. */
const DIRECTIONS = [Direction.Up, Direction.Down, Direction.North, Direction.South, Direction.East, Direction.West];

/** Each block asked about, by a label, its type and the states it is placed with. */
const BLOCKS = [
    ['air', 'minecraft:air'],
    ['stone', 'minecraft:stone'],
    ['glass', 'minecraft:glass'],
    ['leaves', 'minecraft:oak_leaves'],
    ['fence', 'minecraft:oak_fence'],
    ['wall', 'minecraft:cobblestone_wall'],
    ['glass pane', 'minecraft:glass_pane'],
    ['iron bars', 'minecraft:iron_bars'],
    ['bottom slab', 'minecraft:oak_slab', { 'minecraft:vertical_half': 'bottom' }],
    ['top slab', 'minecraft:oak_slab', { 'minecraft:vertical_half': 'top' }],
    ['double slab', 'minecraft:oak_double_slab'],
    ['stairs facing east', 'minecraft:oak_stairs', { weirdo_direction: 0, upside_down_bit: false }],
    ['stairs facing north', 'minecraft:oak_stairs', { weirdo_direction: 3, upside_down_bit: false }],
    ['upside-down stairs', 'minecraft:oak_stairs', { weirdo_direction: 0, upside_down_bit: true }],
    ['stone stairs', 'minecraft:stone_stairs', { weirdo_direction: 1, upside_down_bit: false }],
    ['stone slab', 'minecraft:smooth_stone_slab', { 'minecraft:vertical_half': 'bottom' }],
    ['closed bottom trapdoor', 'minecraft:trapdoor', { open_bit: false, upside_down_bit: false, direction: 0 }],
    ['closed top trapdoor', 'minecraft:trapdoor', { open_bit: false, upside_down_bit: true, direction: 0 }],
    ['open trapdoor', 'minecraft:trapdoor', { open_bit: true, upside_down_bit: false, direction: 0 }],
    ['door', 'minecraft:wooden_door'],
    ['ladder', 'minecraft:ladder', { facing_direction: 2 }],
    ['chest', 'minecraft:chest'],
    ['lantern', 'minecraft:lantern'],
    ['chain', 'minecraft:iron_chain'],
    ['scaffolding', 'minecraft:scaffolding'],
    ['snow layer', 'minecraft:snow_layer'],
    ['carpet', 'minecraft:white_carpet'],
    ['torch', 'minecraft:torch'],
    ['farmland', 'minecraft:farmland'],
    ['soul sand', 'minecraft:soul_sand'],
    ['hopper', 'minecraft:hopper'],
    ['campfire', 'minecraft:campfire'],
    ['standing sign', 'minecraft:standing_sign'],
    ['mangrove roots', 'minecraft:mangrove_roots'],
    ['copper grate', 'minecraft:copper_grate'],
    ['seagrass', 'minecraft:seagrass'],
    ['full snow layer', 'minecraft:snow_layer', { height: 7 }],
    ['cauldron', 'minecraft:cauldron'],
    ['composter', 'minecraft:composter'],
    ['bed', 'minecraft:bed'],
    ['cake', 'minecraft:cake'],
    ['daylight detector', 'minecraft:daylight_detector'],
    ['enchanting table', 'minecraft:enchanting_table'],
    ['stonecutter', 'minecraft:stonecutter_block'],
    ['end portal frame', 'minecraft:end_portal_frame'],
    ['lectern', 'minecraft:lectern'],
    ['anvil', 'minecraft:anvil'],
    ['brewing stand', 'minecraft:brewing_stand'],
    ['bell', 'minecraft:bell'],
    ['piston', 'minecraft:piston'],
    ['sculk sensor', 'minecraft:sculk_sensor'],
    ['big dripleaf', 'minecraft:big_dripleaf'],
    ['pointed dripstone', 'minecraft:pointed_dripstone'],
    ['lightning rod', 'minecraft:lightning_rod'],
    ['candle', 'minecraft:candle'],
    ['sea pickle', 'minecraft:sea_pickle'],
    ['conduit', 'minecraft:conduit'],
    ['decorated pot', 'minecraft:decorated_pot'],
    ['copper bulb', 'minecraft:copper_bulb'],
    ['heavy core', 'minecraft:heavy_core'],
    ['grindstone', 'minecraft:grindstone'],
    ['azalea', 'minecraft:azalea'],
    ['shelf', 'minecraft:oak_shelf']
];

whenLoaded((overworld) => {
    BLOCKS.forEach(([label, type, states], index) => {
        const block = overworld.getBlock({ x: -15 + (index % 15) * 2, y: -60, z: -15 + Math.floor(index / 15) * 2 });
        attempt(label, () => {
            block.setPermutation(BlockPermutation.resolve(type, states));
            return {
                typeId: block.typeId,
                contain: block.canContainLiquid(LiquidType.Water),
                water: DIRECTIONS.map((direction) => block.liquidCanFlowFromDirection(LiquidType.Water, direction))
            };
        });
    });
    system.runTimeout(() => console.warn(`DUMP end ${JSON.stringify({ pack: PACK, records: seq })}`), 20);
});
