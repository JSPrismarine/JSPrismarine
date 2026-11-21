/**
 * The `custom-dimensions` scenario: what `StartupEvent.dimensionRegistry.registerCustomDimension`
 * does. The first run registers a dimension and the names BDS refuses, tries the registry once
 * `startup` is over, and reads the dimension it registered. The capture then sends `/reload`, and
 * the second run registers the same dimension again and one the first run did not.
 *
 * The second run knows it is the second because its top level runs after tick 0, as in the
 * `reload` scenario. Each run stamps its observations with the ticks since it started.
 *
 * `packages/parity/src/scripting/record.ts` defines the format.
 */

import { system, world } from '@minecraft/server';

const PACK = 'dimensions';
const runStart = system.currentTick;
const firstRun = runStart === 0;
let seq = 0;

/** Logs one observation, stamped with the pack's sequence number and the ticks since the run started. */
const record = (event, observed = {}) => {
    seq += 1;
    console.warn(
        `DUMP record ${JSON.stringify({ pack: PACK, seq, tick: system.currentTick - runStart, event, ...observed })}`
    );
};

const end = () => console.warn(`DUMP end ${JSON.stringify({ pack: PACK, records: seq })}`);

/** Logs what a call returned, or what it threw. */
const attempt = (event, call) => {
    try {
        record(event, { value: call() });
    } catch (error) {
        record(event, { error: String(error) });
    }
};

let registry;

if (firstRun) system.beforeEvents.shutdown.subscribe(end);

system.beforeEvents.startup.subscribe((event) => {
    registry = event.dimensionRegistry;
    attempt('register jsp:void', () => registry.registerCustomDimension('jsp:void'));
    if (firstRun) {
        attempt('register jsp:void again', () => registry.registerCustomDimension('jsp:void'));
        attempt('register without a namespace', () => registry.registerCustomDimension('void'));
        attempt('register in the minecraft namespace', () => registry.registerCustomDimension('minecraft:void'));
        attempt('register minecraft:overworld', () => registry.registerCustomDimension('minecraft:overworld'));
        attempt('register an upper-case name', () => registry.registerCustomDimension('jsp:Void'));
        attempt('register a name with a space', () => registry.registerCustomDimension('jsp:a void'));
        attempt('register jsp:second', () => registry.registerCustomDimension('jsp:second'));
    } else {
        attempt('register a dimension new after the reload', () => registry.registerCustomDimension('jsp:reloaded'));
    }
});

world.afterEvents.worldLoad.subscribe(() => {
    attempt('register after startup', () => registry.registerCustomDimension('jsp:late'));
    attempt('dimension id', () => world.getDimension('jsp:void').id);
    attempt('dimension heightRange', () => {
        const { min, max } = world.getDimension('jsp:void').heightRange;
        return { min, max };
    });
    attempt('second dimension id', () => world.getDimension('jsp:second').id);
    attempt('dimension without the namespace', () => world.getDimension('void').id);
    attempt('dimension that was never registered', () => world.getDimension('jsp:missing').id);
    if (firstRun) {
        system.runTimeout(() => record('ready for /reload'), 5);
    } else {
        attempt('dimension new after the reload', () => world.getDimension('jsp:reloaded').id);
        system.runTimeout(end, 20);
    }
});
