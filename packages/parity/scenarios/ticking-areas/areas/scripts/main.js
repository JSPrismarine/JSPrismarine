/**
 * The `ticking-areas` scenario: `world.tickingAreaManager` makes, finds, lists and removes ticking
 * areas, says when their chunks have loaded, and refuses what BDS refuses, and the
 * `/tickingarea` command adds and removes areas beside it. A pig in an area far from the origin
 * shows its chunks tick: its effect counts down. Everything runs once the chunk at the origin has
 * loaded. How soon a chunk loads differs from host to host, so which areas have loaded is read
 * at tick 60, by when every area has on both servers.
 *
 * `packages/parity/src/scripting/record.ts` defines the format.
 */

import { system, world } from '@minecraft/server';

const PACK = 'areas';
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

/** A ticking area as plain data. */
const describe = (area) =>
    area === undefined
        ? null
        : {
              identifier: area.identifier,
              dimension: area.dimension.id,
              boundingBox: area.boundingBox,
              chunkCount: area.chunkCount,
              isFullyLoaded: area.isFullyLoaded
          };

/** The ids of the areas the manager lists, sorted. */
const ids = (manager) =>
    manager
        .getAllTickingAreas()
        .map((area) => area.identifier)
        .sort();

whenLoaded(() => {
    const overworld = world.getDimension('overworld');
    const manager = world.tickingAreaManager;
    /** What each area's promise settled with, by the area's id. */
    const settled = {};
    attempt('tickingAreaManager is the same object', () => world.tickingAreaManager === manager);
    attempt('maxChunkCount', () => manager.maxChunkCount);
    attempt('chunkCount', () => manager.chunkCount);
    attempt('getAllTickingAreas', () => ids(manager));
    attempt('hasCapacity of one chunk', () =>
        manager.hasCapacity({ dimension: overworld, from: { x: 0, y: 0, z: 0 }, to: { x: 15, y: 0, z: 15 } })
    );
    attempt('hasCapacity of a large area', () =>
        manager.hasCapacity({
            dimension: overworld,
            from: { x: -1000, y: 0, z: -1000 },
            to: { x: 1000, y: 0, z: 1000 }
        })
    );
    attempt('createTickingArea', () => {
        manager
            .createTickingArea('jsp:near', {
                dimension: overworld,
                from: { x: -20, y: 5, z: -3 },
                to: { x: 17.5, y: 70, z: 40 }
            })
            .then(
                () => {
                    settled.near = describe(manager.getTickingArea('jsp:near'));
                },
                (error) => {
                    settled.near = String(error);
                }
            );
        return describe(manager.getTickingArea('jsp:near'));
    });
    attempt('createTickingArea far away', () => {
        manager
            .createTickingArea('jsp:far', {
                dimension: overworld,
                from: { x: 1000, y: 0, z: 1000 },
                to: { x: 1010, y: 0, z: 1010 }
            })
            .then(
                () => {
                    settled.far = describe(manager.getTickingArea('jsp:far'));
                },
                (error) => {
                    settled.far = String(error);
                }
            );
        return describe(manager.getTickingArea('jsp:far'));
    });
    attempt('createTickingArea of an id in use', () => {
        manager
            .createTickingArea('jsp:near', {
                dimension: overworld,
                from: { x: 0, y: 0, z: 0 },
                to: { x: 1, y: 0, z: 1 }
            })
            .catch((error) => record('id in use refused', { error: String(error) }));
        return 'called';
    });
    attempt('createTickingArea too large', () => {
        manager
            .createTickingArea('jsp:large', {
                dimension: overworld,
                from: { x: -1000, y: 0, z: -1000 },
                to: { x: 1000, y: 0, z: 1000 }
            })
            .catch((error) => record('too large refused', { error: String(error) }));
        return 'called';
    });
    attempt('createTickingArea without a namespace', () => {
        manager
            .createTickingArea('plain', { dimension: overworld, from: { x: 0, y: 0, z: 0 }, to: { x: 1, y: 0, z: 1 } })
            .then(
                () => {
                    settled.plain = describe(manager.getTickingArea('plain'));
                },
                (error) => {
                    settled.plain = String(error);
                }
            );
        return 'called';
    });
    attempt('hasTickingArea', () => [manager.hasTickingArea('jsp:near'), manager.hasTickingArea('jsp:none')]);
    attempt('getTickingArea of an unknown id', () => manager.getTickingArea('jsp:none') ?? null);
    attempt('getTickingArea of an area', () => describe(manager.getTickingArea(manager.getTickingArea('jsp:near'))));
    attempt('getAllTickingAreas after creating', () => ids(manager));
    attempt('chunkCount after creating', () => manager.chunkCount);
    attempt(
        'the tickingarea command adds',
        () => overworld.runCommand('tickingarea add 32 0 32 40 0 40 jsp_command').successCount
    );
    attempt('getAllTickingAreas after the command', () => ids(manager));
    attempt(
        'the tickingarea command adds a circle',
        () => overworld.runCommand('tickingarea add circle 64 0 64 2 jsp_circle').successCount
    );
    attempt('the tickingarea command lists', () => overworld.runCommand('tickingarea list').successCount);
    attempt(
        'the tickingarea command removes by name',
        () => overworld.runCommand('tickingarea remove jsp_circle').successCount
    );
    attempt(
        'the tickingarea command removes by position',
        () => overworld.runCommand('tickingarea remove 33 0 33').successCount
    );

    system.runTimeout(() => {
        record('settled', { value: settled });
        const pig = overworld.spawnEntity('minecraft:pig', { x: 1005.5, y: 0, z: 1005.5 });
        pig.addEffect('speed', 60, { amplifier: 1 });
        system.runTimeout(() => {
            attempt('a pig in the far area', () => pig.getEffect('speed')?.duration ?? null);
            pig.remove();
            attempt('chunkCount later', () => manager.chunkCount);
            attempt('removeTickingArea', () => {
                manager.removeTickingArea('jsp:near');
                return ids(manager);
            });
            attempt('removeTickingArea of an unknown id', () => manager.removeTickingArea('jsp:none'));
            attempt('removeTickingArea of an area', () => {
                manager.removeTickingArea(manager.getTickingArea('jsp:far'));
                return ids(manager);
            });
            attempt('removeAllTickingAreas', () => {
                manager.removeAllTickingAreas();
                return ids(manager);
            });
            attempt('chunkCount after removing', () => manager.chunkCount);
            overworld.runCommand('tickingarea remove_all');
            console.warn(`DUMP end ${JSON.stringify({ pack: PACK, records: seq })}`);
        }, 5);
    }, 60);
});
