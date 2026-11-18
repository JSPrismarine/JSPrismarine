/**
 * The `system-jobs` scenario: when `system.runJob` advances a generator, relative to the system
 * tasks of the same tick, how far a job gets in one tick, and what `clearJob` stops.
 *
 * Everything is queued from `worldLoad`, which runs at tick 0, so the ticks the record shows count
 * from there. Each yield records the tick it resumed in.
 *
 * `packages/parity/src/scripting/record.ts` defines the format.
 */

import { system, world } from '@minecraft/server';

const PACK = 'jobs';
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

/** A job that records each of its steps. */
function* steps(name, count) {
    for (let step = 1; step <= count; step++) {
        record(`${name} step ${step}`);
        yield;
    }
    record(`${name} done`);
}

world.afterEvents.worldLoad.subscribe(() => {
    record('worldLoad');
    system.run(() => record('run queued before the jobs'));
    const first = system.runJob(steps('job A', 3));
    system.runJob(steps('job B', 2));
    system.runTimeout(() => record('runTimeout 1'), 1);
    attempt('runJob returns a number', () => typeof first);

    const cleared = system.runJob(steps('cleared job', 3));
    attempt('clearJob before it ran', () => system.clearJob(cleared));
    attempt('clearJob of an id never issued', () => system.clearJob(999999));

    let stopping = 0;
    const stopped = system.runJob(
        (function* () {
            for (;;) {
                stopping += 1;
                record(`stopped job step ${stopping}`);
                if (stopping === 2) system.clearJob(stopped);
                yield;
            }
        })()
    );

    system.runJob(
        (function* () {
            record('throwing job step 1');
            yield;
            throw new Error('job failed');
        })()
    );

    let spun = 0;
    let spunTick = system.currentTick;
    let sameTick = 0;
    system.runJob(
        (function* () {
            while (spun < 2000) {
                spun += 1;
                if (system.currentTick === spunTick) sameTick += 1;
                yield;
            }
            record('long job done', { value: { spun, firstTickSteps: sameTick > 1 } });
        })()
    );

    attempt('runJob with a plain function', () => system.runJob(() => {}));
    attempt('runJob with nothing', () => system.runJob());

    system.runTimeout(() => console.warn(`DUMP end ${JSON.stringify({ pack: PACK, records: seq })}`), 40);
});
