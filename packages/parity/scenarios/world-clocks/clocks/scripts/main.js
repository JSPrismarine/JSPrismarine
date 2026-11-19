/**
 * The `world-clocks` scenario: `world.getClock` and a clock's time, pause and time markers, the
 * spline classes a camera animation takes, `Trigger`, and `world.soundDefinitionRegistry`.
 * Everything runs from `worldLoad`, which runs at tick 0.
 *
 * `packages/parity/src/scripting/record.ts` defines the format.
 */

import { CatmullRomSpline, LinearSpline, Trigger, system, world } from '@minecraft/server';

const PACK = 'clocks';
let seq = 0;
let start = 0;

/** Logs one observation, stamped with the pack's sequence number and the tick since `worldLoad`. */
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

/** A clock as plain data. */
const describe = (clock) => ({
    name: clock.name,
    time: clock.time,
    isPaused: clock.isPaused,
    // BDS lists the markers in no fixed order.
    timeMarkers: clock.timeMarkers
        .map((marker) => ({ name: marker.name, time: marker.time, period: marker.period ?? null }))
        .sort((one, two) => (one.name < two.name ? -1 : 1))
});

world.afterEvents.worldLoad.subscribe(() => {
    start = system.currentTick;
    attempt('linear spline', () => {
        const spline = new LinearSpline();
        const empty = spline.controlPoints;
        spline.controlPoints = [
            { x: 1, y: 2, z: 3 },
            { x: 4.5, y: 5, z: 6 }
        ];
        return [empty, spline.controlPoints];
    });
    attempt('catmull-rom spline', () => {
        const spline = new CatmullRomSpline();
        spline.controlPoints = [{ x: 0, y: 0, z: 0 }];
        return spline.controlPoints;
    });
    attempt('trigger', () => {
        const trigger = new Trigger('minecraft:grow_up');
        const before = trigger.eventName;
        trigger.eventName = 'jsp:other';
        return [before, trigger.eventName];
    });
    for (const name of ['minecraft:overworld', 'minecraft:day', 'day', 'minecraft:the_end', 'jsp:missing']) {
        attempt(`getClock ${name}`, () => {
            // The time the world has reached at its load differs from host to host.
            const { time: _time, ...rest } = describe(world.getClock(name));
            return rest;
        });
    }
    let clock;
    try {
        clock = world.getClock('minecraft:overworld');
    } catch {
        clock = undefined;
    }
    if (clock !== undefined) {
        attempt('getClock is the same object', () => world.getClock('minecraft:overworld') === clock);
        attempt('set time', () => {
            clock.time = 100;
            return describe(clock);
        });
        attempt('the world time follows the clock', () => [world.getAbsoluteTime(), world.getTimeOfDay()]);
        attempt('the clock follows the world time', () => {
            world.setAbsoluteTime(24000 + 5000);
            return clock.time;
        });
        attempt('set a negative time', () => {
            clock.time = -5;
            return clock.time;
        });
        attempt('pause', () => {
            clock.isPaused = true;
            return [clock.isPaused, world.gameRules.doDayLightCycle];
        });
        attempt('the daylight cycle rule pauses the clock', () => {
            clock.isPaused = false;
            world.gameRules.doDayLightCycle = false;
            const paused = clock.isPaused;
            world.gameRules.doDayLightCycle = true;
            clock.isPaused = true;
            return paused;
        });
        attempt('addTimeMarker', () => {
            clock.addTimeMarker({ name: 'jsp:noon', time: 6000, period: 24000 });
            clock.addTimeMarker({ name: 'jsp:once', time: 500 });
            return describe(clock);
        });
        attempt('addTimeMarker of a name in use', () => clock.addTimeMarker({ name: 'jsp:noon', time: 1 }));
        attempt('set to a marker', () => {
            clock.set('jsp:noon');
            return clock.time;
        });
        attempt('skipTo a marker', () => {
            clock.time = 7000;
            clock.skipTo('jsp:noon');
            return clock.time;
        });
        attempt('rewindTo a marker', () => {
            clock.time = 7000;
            clock.rewindTo('jsp:once');
            return clock.time;
        });
        attempt('set to an unknown marker', () => clock.set('jsp:missing'));
        attempt('removeTimeMarker', () => {
            clock.removeTimeMarker('jsp:once');
            return describe(clock).timeMarkers.map((marker) => marker.name);
        });
        attempt('removeTimeMarker of an unknown marker', () => clock.removeTimeMarker('jsp:missing'));
        attempt('removeTimeMarker of a built-in marker', () => {
            const builtIn = clock.timeMarkers.find((marker) => marker.name.startsWith('minecraft:'));
            return builtIn === undefined ? 'none' : clock.removeTimeMarker(builtIn);
        });
        const paused = clock.time;
        system.runTimeout(() => {
            attempt('paused a tick later', () => clock.time - paused);
            clock.isPaused = false;
            const resumed = clock.time;
            system.runTimeout(() => {
                attempt('running two ticks later', () => clock.time - resumed);
                clock.removeTimeMarker('jsp:noon');
                finish();
            }, 2);
        }, 1);
    } else {
        finish();
    }
});

/** Records the sound definitions and ends the record. */
const finish = () => {
    const registry = world.soundDefinitionRegistry;
    attempt('soundDefinitionRegistry is the same object', () => world.soundDefinitionRegistry === registry);
    attempt('getDefinitions has many', () => registry.getDefinitions().length > 100);
    attempt('getDefinitions of random.orb', () =>
        registry
            .getDefinitions()
            .filter((definition) => definition.soundEventId === 'random.orb')
            .map((definition) => ({
                soundEventId: definition.soundEventId,
                durationInfo: definition.durationInfo ?? null,
                musicInfo: definition.musicInfo ?? null,
                tags: definition.tags ?? null
            }))
    );
    attempt('getDefinitions by title', () =>
        registry.getDefinitions({ titles: ['Cat'] }).map((definition) => ({
            soundEventId: definition.soundEventId,
            durationInfo: definition.durationInfo ?? null,
            musicInfo: definition.musicInfo ?? null
        }))
    );
    attempt('getDefinitions of music', () => registry.getDefinitions({ minDuration: 1 }).length > 0);
    console.warn(`DUMP end ${JSON.stringify({ pack: PACK, records: seq })}`);
};
