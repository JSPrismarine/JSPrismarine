/**
 * The `system-tasks` scenario: when `system.run`, `system.runTimeout` and `system.runInterval`
 * callbacks run, relative to each other and to the promise jobs they queue, in the script flush
 * at the end of a tick.
 *
 * Everything is queued from `worldLoad`, which runs with the default privilege at tick 0, so the
 * ticks the record shows count from there.
 *
 * Each callback logs one observation as `DUMP record <json>` on the content log, and the pack
 * logs `DUMP end <json>` once the observed callbacks have all had their chance to run.
 * `packages/parity/src/scripting/record.ts` defines the format.
 */

import { system, world } from '@minecraft/server';

const PACK = 'tasks';
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
    record('worldLoad');

    system.run(() => {
        record('run A');
        Promise.resolve().then(() => record('run A promise job'));
        system.run(() => record('run A nested run'));
        system.runTimeout(() => record('run A nested runTimeout 0'), 0);
    });
    system.run(() => record('run B'));
    system.runTimeout(() => record('runTimeout 0'), 0);
    system.runTimeout(() => record('runTimeout without a delay'));
    system.runTimeout(() => record('runTimeout 2'), 2);

    let fast = 0;
    const fastId = system.runInterval(() => {
        fast += 1;
        record(`runInterval 0 call ${fast}`);
        if (fast === 3) system.clearRun(fastId);
    }, 0);

    let slow = 0;
    const slowId = system.runInterval(() => {
        slow += 1;
        record(`runInterval 3 call ${slow}`);
        if (slow === 2) system.clearRun(slowId);
    }, 3);

    let unset = 0;
    const unsetId = system.runInterval(() => {
        unset += 1;
        record(`runInterval without an interval call ${unset}`);
        if (unset === 2) system.clearRun(unsetId);
    });

    const cleared = system.runTimeout(() => record('cleared runTimeout ran'), 1);
    system.clearRun(cleared);
    attempt('clearRun of an id already cleared', () => system.clearRun(cleared));
    attempt('clearRun of an id never issued', () => system.clearRun(999999));

    const first = system.run(() => {});
    const second = system.run(() => {});
    attempt('run returns a number', () => typeof first);
    attempt('run ids increase by one', () => second - first);

    attempt('run that throws', () =>
        system.run(() => {
            record('run that throws ran');
            throw new Error('thrown from a run');
        })
    );
    system.run(() => record('run after the one that throws'));

    // A delay the uint32 bounds check lets through or refuses: when each one's task runs, if it
    // runs. An interval clears itself after three calls, so one that repeats within a tick ends.
    const delays = [
        ['NaN', Number.NaN],
        ['Infinity', Number.POSITIVE_INFINITY],
        ['-1', -1]
    ];
    for (const [name, delay] of delays) {
        attempt(
            `runTimeout with a delay of ${name}`,
            () => typeof system.runTimeout(() => record(`runTimeout ${name} ran`), delay)
        );
        let calls = 0;
        attempt(`runInterval with an interval of ${name}`, () => {
            const id = system.runInterval(() => {
                calls += 1;
                record(`runInterval ${name} call ${calls}`);
                if (calls === 3) system.clearRun(id);
            }, delay);
            return typeof id;
        });
    }

    Promise.resolve().then(() => record('worldLoad promise job'));
});

system.runTimeout(() => console.warn(`DUMP end ${JSON.stringify({ pack: PACK, records: seq })}`), 20);
