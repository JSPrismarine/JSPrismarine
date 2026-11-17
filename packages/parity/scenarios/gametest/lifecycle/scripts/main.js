/**
 * The `lifecycle` pack of the `gametest` scenario: what a GameTest's test function, its `Test`
 * and the runner do from registration to the end of each test. The pack registers its tests at
 * its top level, in early execution, and the capture runs them all with `/gametest runall` once
 * the pack is ready. Each test uses `structures/jsp/air.mcstructure`, a 3 by 3 by 3 structure of
 * air, at a fixed structure location.
 *
 * A test records when it starts and what its calls return or throw, and a task that runs every
 * tick records the tick each test completes on. Ticks are counted from the tick the first test
 * starts, which depends on when the console command arrives.
 *
 * `packages/parity/src/scripting/record.ts` defines the format.
 */

import { system, world } from '@minecraft/server';
import { GameTestCompletedError, GameTestError, register, Tags } from '@minecraft/server-gametest';

const PACK = 'lifecycle';
let seq = 0;
/** The tick the first test started on. */
let start;

/** Logs one observation, stamped with the pack's sequence number and the tick since the first test started. */
const record = (event, observed = {}) => {
    seq += 1;
    const tick = start === undefined ? 0 : system.currentTick - start;
    console.warn(`DUMP record ${JSON.stringify({ pack: PACK, seq, tick, event, ...observed })}`);
};

/** Logs what a call returned, or what it threw. */
const attempt = (event, call) => {
    try {
        record(event, { value: call() });
    } catch (error) {
        record(event, { error: String(error), value: describeError(error) });
    }
};

/** What a thrown value is, beyond its text. */
const describeError = (error) => ({
    gameTestError: error instanceof GameTestError,
    completedError: error instanceof GameTestCompletedError,
    type: typeof error === 'object' && error !== null && 'type' in error ? String(error.type) : null,
    reason: typeof error === 'object' && error !== null && 'reason' in error ? String(error.reason) : null
});

/** A vector as plain data, which the record can hold. */
const vector = ({ x, y, z }) => ({ x, y, z });

/** The tests that have started, by name, and those whose completion is recorded. */
const tests = new Map();
const completed = new Set();

/** Records that a test started, and keeps its `Test` for the completion check. */
const started = (name, test) => {
    if (start === undefined) start = system.currentTick;
    tests.set(name, test);
    record(`${name}: started`);
};

/** Registers a test of class `jsp` in the shared air structure. */
const air = (name, run) =>
    register('jsp', name, (test) => {
        started(name, test);
        run(test);
    })
        .structureName('jsp:air')
        .structureLocation({ x: 0, y: -60, z: 0 })
        .maxTicks(20)
        .tag('jsp');

air('succeeds', (test) => {
    test.runAfterDelay(2, () => record('succeeds: runAfterDelay 2'));
    attempt('succeeds: succeed', () => test.succeed());
    attempt('succeeds: isCompleted', () => test.isCompleted());
    attempt('succeeds: succeed again', () => test.succeed());
    attempt('succeeds: worldLocation after succeed', () => vector(test.worldLocation({ x: 0, y: 0, z: 0 })));
});

air('fails', (test) => {
    attempt('fails: fail', () => test.fail('boom'));
    attempt('fails: isCompleted', () => test.isCompleted());
});

air('asserts', (test) => {
    attempt('asserts: assert true', () => test.assert(true, 'fine'));
    attempt('asserts: assert false', () => test.assert(false, 'nope'));
    attempt('asserts: isCompleted after a caught assert', () => test.isCompleted());
    attempt('asserts: succeed', () => test.succeed());
});

air('throws', () => {
    throw new Error('thrown');
});

air('times_out', (test) => {
    test.runAfterDelay(2, () => record('times_out: runAfterDelay 2'));
    test.runAfterDelay(10, () => record('times_out: runAfterDelay 10'));
}).maxTicks(5);

air('succeeds_when', (test) => {
    let calls = 0;
    test.succeedWhen(() => {
        calls += 1;
        record('succeeds_when: check', { value: calls });
        test.assert(calls >= 3, 'not yet');
    });
});

air('idles', (test) => {
    test.idle(3).then(
        () => {
            record('idles: resolved');
            test.succeed();
        },
        (error) => record('idles: rejected', { error: String(error) })
    );
});

air('locations', (test) => {
    attempt('locations: worldLocation', () => vector(test.worldLocation({ x: 1, y: 2, z: 1 })));
    attempt('locations: worldBlockLocation', () => vector(test.worldBlockLocation({ x: 1.5, y: 2.5, z: 1.5 })));
    test.succeed();
});

air('cleanup', (test) => {
    const player = test.spawnSimulatedPlayer({ x: 1, y: 2, z: 1 }, 'Cleaner');
    attempt('cleanup: players', () => world.getAllPlayers().map((each) => each.name));
    test.succeed();
    system.runTimeout(() => {
        attempt('cleanup: players later', () => world.getAllPlayers().map((each) => each.name));
        attempt('cleanup: isValid later', () => player.isValid);
    }, 3);
});

air('disabled', (test) => test.succeed()).tag(Tags.suiteDisabled);

air('batched', (test) => test.succeed()).batch('jsp_second');

air('optional', (test) => test.fail('optional')).required(false);

system.run(() => attempt('register after startup', () => register('jsp', 'late', () => {})));

system.runInterval(() => {
    for (const [name, test] of tests) {
        if (completed.has(name)) continue;
        let done;
        try {
            done = test.isCompleted();
        } catch (error) {
            done = String(error);
        }
        if (done === false) continue;
        completed.add(name);
        record(`${name}: completed`, { value: done });
    }
    if (start !== undefined && system.currentTick - start === 80) {
        console.warn(`DUMP end ${JSON.stringify({ pack: PACK, records: seq })}`);
    }
});

record('ready for /gametest', { value: Tags.suiteDisabled });
