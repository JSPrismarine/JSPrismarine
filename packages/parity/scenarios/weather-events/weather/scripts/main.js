/**
 * The `weather-events` scenario: a before-event a script cancels, and the after-event that
 * follows the change it lets through. `Dimension.setWeather` raises both, so the scenario needs
 * no player. The before-event runs in restricted execution, so the record also shows which calls
 * restricted execution refuses and with what message, and `world.sendMessage`, which it allows.
 *
 * `packages/parity/src/scripting/record.ts` defines the format.
 */

import { system, WeatherType, world } from '@minecraft/server';

const PACK = 'weather';
let seq = 0;

/** Logs one observation, stamped with the pack's sequence number and the current tick. */
const record = (event, observed = {}) => {
    seq += 1;
    console.warn(`DUMP record ${JSON.stringify({ pack: PACK, seq, tick: system.currentTick, event, ...observed })}`);
};

/** Logs what a call returned, or what it threw. */
const attempt = (event, call) => {
    try {
        record(event, { value: call() });
    } catch (error) {
        record(event, { error: String(error) });
    }
};

world.beforeEvents.weatherChange.subscribe((event) => {
    record('beforeEvents.weatherChange', {
        value: { previousWeather: event.previousWeather, newWeather: event.newWeather, duration: event.duration }
    });
    attempt('before-event setWeather', () => world.getDimension('overworld').setWeather(WeatherType.Clear, 100));
    attempt('before-event world.sendMessage', () => world.sendMessage('from a before-event'));
    attempt('before-event getDimension', () => world.getDimension('overworld').id);
    attempt('before-event queue system.run', () => {
        system.run(() => record('system.run queued in the before-event'));
    });
    Promise.resolve().then(() => record('promise job queued in the before-event'));
    if (event.newWeather === WeatherType.Thunder) event.cancel = true;
});

world.afterEvents.weatherChange.subscribe((event) => {
    record('afterEvents.weatherChange', {
        value: { dimension: event.dimension, previousWeather: event.previousWeather, newWeather: event.newWeather }
    });
    attempt('after-event world.sendMessage', () => world.sendMessage('from an after-event'));
    Promise.resolve().then(() => record('promise job queued in the after-event'));
    system.run(() => record('system.run queued in the after-event'));
});

world.afterEvents.worldLoad.subscribe(() => {
    system.runTimeout(() => {
        const overworld = world.getDimension('overworld');
        attempt('setWeather Rain', () => overworld.setWeather(WeatherType.Rain, 6000));
        record('after setWeather Rain');
        attempt('setWeather Thunder, which the before-event cancels', () =>
            overworld.setWeather(WeatherType.Thunder, 6000)
        );
        record('after setWeather Thunder');
    }, 2);
    system.runTimeout(() => {
        attempt('setWeather Rain again', () => world.getDimension('overworld').setWeather(WeatherType.Rain, 6000));
        attempt('setWeather Clear', () => world.getDimension('overworld').setWeather(WeatherType.Clear, 6000));
    }, 5);
});

system.runTimeout(() => console.warn(`DUMP end ${JSON.stringify({ pack: PACK, records: seq })}`), 20);
