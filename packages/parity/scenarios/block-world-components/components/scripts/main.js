/**
 * The `block-world-components` scenario: the block components a world system stands behind, a
 * sign's text, a piston's state, a jukebox's record, a cauldron's fluid, a redstone block's power,
 * a note block's instrument, a crafter's slots, and the placement answers, in the flat world.
 * Everything runs once the chunk at the origin has loaded.
 *
 * `packages/parity/src/scripting/record.ts` defines the format.
 */

import {
    BlockPermutation,
    Direction,
    DyeColor,
    ItemStack,
    LiquidType,
    SignSide,
    system,
    world
} from '@minecraft/server';

const PACK = 'components';
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

whenLoaded((overworld) => {
    const set = (x, z, type, states) => {
        const block = overworld.getBlock({ x, y: -60, z });
        block.setPermutation(BlockPermutation.resolve(type, states));
        return block;
    };
    const sign = set(1, 7, 'minecraft:standing_sign');
    attempt('sign', () => {
        const component = sign.getComponent('minecraft:sign');
        const before = [component.getText() ?? null, component.isWaxed, component.getTextDyeColor() ?? null];
        component.setText('Hello');
        component.setText({ rawtext: [{ text: 'Back' }] }, SignSide.Back);
        component.setTextDyeColor(DyeColor.Red);
        return [
            before,
            component.getText(),
            component.getText(SignSide.Back) ?? null,
            component.getRawText(SignSide.Back) ?? null,
            component.getTextDyeColor()
        ];
    });
    attempt('sign setWaxed', () => {
        const component = sign.getComponent('minecraft:sign');
        component.setWaxed(true);
        return component.isWaxed;
    });
    const piston = set(3, 7, 'minecraft:piston', { facing_direction: 1 });
    attempt('piston', () => {
        const component = piston.getComponent('minecraft:piston');
        return [
            component.state,
            component.isMoving,
            component.getAttachedBlocks().length,
            component.getAttachedBlocksLocations()
        ];
    });
    const jukebox = set(5, 7, 'minecraft:jukebox');
    attempt('jukebox', () => {
        const component = jukebox.getComponent('minecraft:record_player');
        const before = [component.isPlaying(), component.getRecord() ?? null];
        component.setRecord('minecraft:music_disc_cat', false);
        const placed = [component.isPlaying(), component.getRecord()?.typeId ?? null];
        component.playRecord();
        const playing = component.isPlaying();
        component.pauseRecord();
        const paused = component.isPlaying();
        component.ejectRecord();
        return [before, placed, playing, paused, component.getRecord() ?? null];
    });
    const cauldron = set(7, 7, 'minecraft:cauldron');
    attempt('cauldron', () => {
        const component = cauldron.getComponent('minecraft:fluid_container');
        const before = [component.fillLevel, component.getFluidType()];
        component.fillLevel = 6;
        component.setFluidType('Water');
        const water = [component.fillLevel, component.getFluidType(), component.fluidColor];
        component.addDye(new ItemStack('minecraft:red_dye').type);
        return [before, water, component.fluidColor];
    });
    const redstone = set(9, 7, 'minecraft:redstone_block');
    attempt('redstone producer', () => {
        const component = redstone.getComponent('minecraft:redstone_producer');
        return [
            component.power,
            component.getConnectedFaces(),
            component.getStronglyPoweredFace() ?? null,
            redstone.getRedstonePower() ?? null
        ];
    });
    const note = set(11, 7, 'minecraft:noteblock');
    attempt('instrument', () => {
        const component = note.getComponent('minecraft:instrument_sound');
        return component === undefined
            ? null
            : [component.getInstrumentName(Direction.Up), component.getInstrumentName(Direction.Down)];
    });
    attempt('instrument of stone', () => {
        const component = set(12, 7, 'minecraft:stone').getComponent('minecraft:instrument_sound');
        return component === undefined ? null : component.getInstrumentName(Direction.Up);
    });
    attempt('canPlace', () => {
        const air = overworld.getBlock({ x: 13, y: -55, z: 7 });
        const ground = set(13, 7, 'minecraft:dirt');
        return [
            ground.above().canPlace('minecraft:torch'),
            air.canPlace('minecraft:torch'),
            air.canPlace('minecraft:stone'),
            ground.canPlace('minecraft:stone'),
            ground.above().canPlace(BlockPermutation.resolve('minecraft:torch'), Direction.Up)
        ];
    });
    attempt('liquidCanFlowFromDirection', () => {
        const fence = set(14, 7, 'minecraft:oak_fence');
        const slab = set(15, 7, 'minecraft:oak_slab');
        return [
            fence.liquidCanFlowFromDirection(LiquidType.Water, Direction.North),
            fence.liquidCanFlowFromDirection(LiquidType.Water, Direction.Up),
            slab.liquidCanFlowFromDirection(LiquidType.Water, Direction.Up),
            slab.liquidCanFlowFromDirection(LiquidType.Water, Direction.Down)
        ];
    });
    const bundle = new ItemStack('minecraft:bundle');
    attempt('bundle container', () => {
        const container = bundle.getComponent('minecraft:inventory').container;
        return [container.size, container.containerRules ?? null, container.weight];
    });
    record('components done');
    system.runTimeout(() => console.warn(`DUMP end ${JSON.stringify({ pack: PACK, records: seq })}`), 5);
});
