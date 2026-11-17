/**
 * The `argument-errors` scenario: what Script API members throw when a script passes arguments
 * their metadata refuses, before any member does its work. A wrong type, a wrong count, a number
 * outside its bounds, a value outside an enum, and a class with no constructor.
 *
 * The calls run from `worldLoad`, with the default privilege, so no privilege check gets in the
 * way of the argument checks.
 *
 * `packages/parity/src/scripting/record.ts` defines the format.
 */

import { Dimension, system, WeatherType, World, world } from '@minecraft/server';

const PACK = 'args';
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

world.afterEvents.worldLoad.subscribe(() => {
    const overworld = world.getDimension('overworld');

    attempt('system.run with a number', () => system.run(42));
    attempt('system.run with no argument', () => system.run());
    attempt('system.runTimeout with a string delay', () => system.runTimeout(() => {}, '1'));
    attempt('system.runTimeout with a negative delay', () => system.runTimeout(() => {}, -1));
    attempt('system.runTimeout with a fractional delay', () => typeof system.runTimeout(() => {}, 1.5));
    attempt('system.runTimeout with an extra argument', () => typeof system.runTimeout(() => {}, 1, 2));
    attempt('system.clearRun with a string', () => system.clearRun('1'));
    attempt('world.getDimension with a number', () => world.getDimension(5));
    attempt('world.getDimension with no argument', () => world.getDimension());
    attempt('world.getDimension returns a Dimension', () => overworld instanceof Dimension);
    attempt('world.sendMessage with a number', () => world.sendMessage(42));
    attempt('world.sendMessage with no argument', () => world.sendMessage());
    attempt('world.sendMessage with an array holding a number', () => world.sendMessage(['a', 1]));
    attempt('setWeather with a duration of 0', () => overworld.setWeather(WeatherType.Clear, 0));
    attempt('setWeather with a duration past its maximum', () => overworld.setWeather(WeatherType.Clear, 1000001));
    attempt('setWeather with a type outside the enum', () => overworld.setWeather('Snow', 100));
    attempt('new World()', () => new World());
    attempt('World() without new', () => World());
    attempt('new Dimension()', () => new Dimension());
    attempt('assigning to system.currentTick', () => {
        system.currentTick = 5;
    });
    attempt('calling a method on the wrong receiver', () => world.getDimension.call({}, 'overworld'));
});

system.runTimeout(() => console.warn(`DUMP end ${JSON.stringify({ pack: PACK, records: seq })}`), 20);
