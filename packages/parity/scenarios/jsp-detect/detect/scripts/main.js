/**
 * The `jsp-detect` scenario: a pack that uses `@jsprismarine/server` where it exists and falls
 * back where it does not, the pattern docs/guide/jsprismarine-module.md teaches. The manifest
 * leaves the module out. The pack imports it with `import()` inside `try`, so on Bedrock Dedicated
 * Server the import rejects and the pack takes its fallback, and on JSPrismarine it resolves.
 *
 * It also records what a file that imports the module statically does when the pack loads that
 * file with `import()`.
 *
 * `packages/parity/src/scripting/record.ts` defines the format.
 */

import { system, world } from '@minecraft/server';

const PACK = 'detect';
let seq = 0;

/** Logs one observation, stamped with the pack's sequence number and the current tick. */
const record = (event, observed = {}) => {
    seq += 1;
    console.warn(`DUMP record ${JSON.stringify({ pack: PACK, seq, tick: system.currentTick, event, ...observed })}`);
};

/** The JSPrismarine module, or undefined on a server without it. */
const loadJsprismarine = async () => {
    try {
        const jsp = await import('@jsprismarine/server');
        record('import @jsprismarine/server', { value: 'resolved' });
        return jsp;
    } catch (error) {
        record('import @jsprismarine/server', { error: String(error) });
        return undefined;
    }
};

/** The type of each property of an object, by name, in name order. */
const typesOf = (object) =>
    Object.fromEntries(
        Object.keys(object)
            .sort()
            .map((key) => [key, typeof object[key]])
    );

/**
 * What a pack can rely on in the module: its exports, the type of each value it reports, and the
 * members that reach the running server, each checked with `in` as a pack on an older server would.
 */
const describe = (jsp) => ({
    exports: Object.keys(jsp).sort(),
    name: jsp.jsprismarine.name,
    version: typeof jsp.jsprismarine.version,
    minecraftVersion: typeof jsp.jsprismarine.minecraftVersion,
    protocolVersion: typeof jsp.jsprismarine.protocolVersion,
    maxPlayers: typeof jsp.jsprismarine.maxPlayers,
    frozen: Object.isFrozen(jsp.jsprismarine),
    performance: 'performance' in jsp ? typesOf(jsp.performance) : 'absent',
    getPing: 'getPing' in jsp ? typeof jsp.getPing : 'absent',
    bossBars: 'bossBars' in jsp ? typesOf(jsp.bossBars) : 'absent',
    placeholders: 'placeholders' in jsp ? typesOf(jsp.placeholders) : 'absent',
    allFrozen: Object.values(jsp).every((value) => Object.isFrozen(value))
});

world.afterEvents.worldLoad.subscribe(async () => {
    const jsp = await loadJsprismarine();
    record('server', { value: jsp === undefined ? 'fallback' : describe(jsp) });
    await import('./static.js').then(
        ({ serverName }) => record('import ./static.js', { value: serverName }),
        (error) => record('import ./static.js', { error: String(error) })
    );
});

system.runTimeout(() => console.warn(`DUMP end ${JSON.stringify({ pack: PACK, records: seq })}`), 20);
