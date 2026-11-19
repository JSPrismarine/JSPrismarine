/**
 * The `world-pending` scenario: the world members JSPrismarine has no system behind yet, so its
 * row stays a recorded gap until they come: points of interest, a playing sound's controls,
 * Bedrock feature placement, jigsaw placement and a pack's structures.
 *
 * `packages/parity/src/scripting/record.ts` defines the format.
 */

import { system, world } from '@minecraft/server';

const PACK = 'pending';
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
        const value = call();
        record(event, { value: value === undefined ? 'undefined' : value });
    } catch (error) {
        record(event, { error: String(error) });
    }
};

/** Runs `run` once the chunk at the origin is loaded, adding a ticking area for BDS. */
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
            run();
        }, 1);
    });
};

whenLoaded(() => {
    const overworld = world.getDimension('overworld');
    attempt(
        'poiManager blocks in range',
        () => overworld.poiManager.blocks.getInRange({ x: 0, y: 20, z: 0 }, 16).length
    );
    attempt('poiManager block at', () => overworld.poiManager.blocks.at({ x: 0, y: 20, z: 0 }) ?? null);
    const sound = overworld.playSound('record.cat', { x: 0, y: 20, z: 0 });
    for (const [label, call] of [
        ['pause', () => sound.pause()],
        ['resume', () => sound.resume()],
        ['setVolume', () => sound.setVolume(0.5)],
        ['setPitch', () => sound.setPitch(1.5)],
        ['fade', () => sound.fade(1, 0.2)],
        ['seekTo', () => sound.seekTo(2)],
        ['stop', () => sound.stop()]
    ]) {
        attempt(`SoundInstance.${label}`, call);
    }
    attempt('placeFeature of a pack feature', () =>
        overworld.placeFeature('minecraft:oak_tree_feature', { x: 4, y: 20, z: 4 })
    );
    attempt('getPackStructureIds', () =>
        world.structureManager.getPackStructureIds().filter((id) => id.startsWith('jsp'))
    );
    attempt('placeJigsaw of an unknown pool', () =>
        world.structureManager.placeJigsaw('jsp:missing', 'jsp:start', overworld, { x: 0, y: 20, z: 0 })
    );
    attempt('placeJigsawStructure of an unknown structure', () =>
        world.structureManager.placeJigsawStructure('jsp:missing', overworld, { x: 0, y: 20, z: 0 })
    );
    system.runTimeout(() => console.warn(`DUMP end ${JSON.stringify({ pack: PACK, records: seq })}`), 1);
});
