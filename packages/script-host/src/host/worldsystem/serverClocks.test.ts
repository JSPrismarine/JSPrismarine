import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { loadLibrary, scriptHostAvailable } from '../../testing/library.test-utils';
import { lastMarkerTime, nextMarkerTime } from './serverClocks';
import { SystemScripts } from './serverWorld.test-utils';

const harness = new SystemScripts(loadLibrary);
afterEach(() => harness.stopAll());
afterAll(() => harness.removeAll());

describe('a time marker', () => {
    it("comes next after now on its period, and last at or before now, as BDS's skipTo and rewindTo read it", () => {
        expect(nextMarkerTime({ name: 'noon', time: 6000, period: 24_000 }, 7000)).toBe(30_000);
        expect(nextMarkerTime({ name: 'noon', time: 6000, period: 24_000 }, 100)).toBe(6000);
        expect(lastMarkerTime({ name: 'once', time: 500 }, 7000)).toBe(500);
        expect(lastMarkerTime({ name: 'noon', time: 6000, period: 24_000 }, 31_000)).toBe(30_000);
        expect(lastMarkerTime({ name: 'later', time: 9000 }, 7000)).toBeUndefined();
    });
});

describe.skipIf(!scriptHostAvailable())('world clocks, splines and triggers', () => {
    it("reads and writes the overworld clock, which is the world's time, and its markers", () => {
        const { lines, world } = harness.start(
            `
            world.afterEvents.worldLoad.subscribe(() => {
                const clock = world.getClock('minecraft:overworld');
                log('same', () => world.getClock('minecraft:overworld') === clock);
                log('other', () => world.getClock('minecraft:the_end'));
                log('time', () => { clock.time = 100; return [clock.time, world.getAbsoluteTime()]; });
                log('markers', () => clock.timeMarkers.length);
                log('add', () => { clock.addTimeMarker({ name: 'jsp:noon', time: 6000, period: 24000 }); return clock.timeMarkers.length; });
                log('add again', () => clock.addTimeMarker({ name: 'jsp:noon', time: 1 }));
                log('skip', () => { clock.time = 7000; clock.skipTo('jsp:noon'); return clock.time; });
                log('rewind', () => { clock.rewindTo('minecraft:day'); return clock.time; });
                const marker = clock.timeMarkers.find((each) => each.name === 'jsp:noon');
                log('marker', () => [marker.name, marker.time, marker.period]);
                log('remove', () => { clock.removeTimeMarker(marker); return marker.time; });
                log('remove built-in', () => clock.removeTimeMarker('minecraft:noon'));
                log('pause', () => { clock.isPaused = true; return clock.isPaused; });
                log('splines', () => { const spline = new server.LinearSpline(); spline.controlPoints = [{ x: 1, y: 2, z: 3 }]; return spline.controlPoints; });
                log('trigger', () => { const trigger = new server.Trigger('a'); trigger.eventName = 'b'; return trigger.eventName; });
                log('sounds', () => world.soundDefinitionRegistry.getDefinitions().length);
            });`
        );
        expect(lines).toEqual([
            'same true',
            "other ! WorldClockNotFoundError: Failed to find world clock 'minecraft:the_end'.",
            'time [100,100]',
            'markers 6',
            'add 7',
            "add again ! WorldClockAddTimeMarkerError: Failed to add time marker 'jsp:noon' on world clock 'minecraft:overworld' Time marker name already exists.",
            'skip 30000',
            'rewind 25000',
            'marker ["jsp:noon",6000,24000]',
            "remove ! WorldClockInvalidTimeMarkerError: Time marker 'jsp:noon' is no longer valid.",
            "remove built-in ! WorldClockRemoveMinecraftTimeMarkerError: Failed to remove time marker 'minecraft:noon' from world clock 'minecraft:overworld'. A time marker with the 'minecraft' namespace cannot be removed.",
            'pause true',
            'splines []',
            'trigger "b"',
            'sounds 0'
        ]);
        expect(world.worldSystem.absoluteTime()).toBe(25_000);
    });
});
