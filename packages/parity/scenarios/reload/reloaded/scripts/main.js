/**
 * The `reload` scenario: what `/reload` does to a running pack. BDS sends
 * `system.beforeEvents.shutdown`, drops the tasks the pack queued, and runs the pack again from
 * its top level, with its `startup` and `worldLoad`, while `system.currentTick` carries on.
 *
 * A script cannot run `/reload` itself (`runCommand('reload')` succeeds 0 times), so the capture
 * sends it on the console once the pack records `ready for /reload`. When the command lands
 * depends on the host, so this pack stamps each observation with the ticks since its run started,
 * not `system.currentTick`, and the shutdown, which happens whenever the command lands, with -1.
 *
 * A reload starts the script over, so the pack's record starts over too: the first run ends in
 * `shutdown`, the second at a fixed delay, and each writes its own end line. The second run knows
 * it is the second because its top level runs after tick 0.
 *
 * `packages/parity/src/scripting/record.ts` defines the format.
 */

import { system, world } from '@minecraft/server';

const PACK = 'reloaded';
const runStart = system.currentTick;
let seq = 0;

/** Logs one observation, stamped with the pack's sequence number and the ticks since the run started. */
const record = (event, observed = {}, tick = system.currentTick - runStart) => {
    seq += 1;
    console.warn(`DUMP record ${JSON.stringify({ pack: PACK, seq, tick, event, ...observed })}`);
};

const end = () => console.warn(`DUMP end ${JSON.stringify({ pack: PACK, records: seq })}`);

const firstRun = runStart === 0;
record('top-level', { value: firstRun ? 'first run' : 'after the reload' });
system.beforeEvents.startup.subscribe(() => record('system.beforeEvents.startup'));
world.afterEvents.worldLoad.subscribe(() => record('world.afterEvents.worldLoad'));
system.run(() => record('top-level system.run'));

if (firstRun) {
    system.beforeEvents.shutdown.subscribe(() => {
        record('system.beforeEvents.shutdown', {}, -1);
        end();
    });
    system.runTimeout(() => record('ready for /reload'), 5);
    // Long after the reload lands, so it shows that a reload drops the tasks queued before it.
    system.runTimeout(() => record('a task queued before the reload'), 40);
} else {
    system.runTimeout(end, 60);
}
