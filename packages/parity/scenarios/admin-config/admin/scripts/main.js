/**
 * The `admin-config` scenario: `@minecraft/server-admin`'s `variables` and `secrets`, which read
 * the pack's `config/<script module uuid>/variables.json` and `secrets.json`, `SecretString`, and
 * `transferPlayer`. A behavior pack scenario has no client to transfer, so the pack registers the
 * GameTest `jsp:transfer`, which the capture runs with `/gametest run` once the pack is ready, and
 * transfers the simulated player the test spawns. `structures/jsp/transfer.mcstructure` is the
 * test's 3 by 3 by 3 structure of air.
 *
 * Ticks are counted from the tick the pack loads until the test starts, and from the test's start
 * after that, which depends on when the console command arrives.
 *
 * `packages/parity/src/scripting/record.ts` defines the format.
 */

import { system, world } from '@minecraft/server';
import { SecretString, secrets, transferPlayer, variables } from '@minecraft/server-admin';
import { register } from '@minecraft/server-gametest';

const PACK = 'admin';
let seq = 0;
let start = 0;

/** Logs one observation, stamped with the pack's sequence number and the tick since the test started. */
const record = (event, observed = {}) => {
    seq += 1;
    console.warn(
        `DUMP record ${JSON.stringify({ pack: PACK, seq, tick: system.currentTick - start, event, ...observed })}`
    );
};

/** Logs what a call returned, or what it threw. */
const attempt = (event, call) => {
    try {
        record(event, { value: call() });
    } catch (error) {
        record(event, { error: String(error) });
    }
};

/** What a secret looks like to a script, which never sees its text. */
const secret = (value) =>
    value === undefined
        ? 'undefined'
        : {
              type: typeof value,
              constructor: value.constructor?.name,
              instance: value instanceof SecretString,
              string: String(value),
              json: JSON.stringify(value),
              keys: Object.keys(value)
          };

attempt('variables.names in early execution', () => variables.names);
attempt('secrets.names in early execution', () => secrets.names);
attempt('new SecretString in early execution', () => secret(new SecretString('made')));
for (const name of ['text', 'number', 'integer', 'flag', 'nothing', 'list', 'object', 'missing']) {
    attempt(`variables.get ${name}`, () => {
        const value = variables.get(name);
        return value === undefined ? 'undefined' : value;
    });
}
attempt('variables.get gives a copy', () => {
    variables.get('object').b = 99;
    return variables.get('object').b;
});
attempt('variables.get keeps the key order', () => Object.keys(variables.get('object')));
for (const name of ['token', 'number', 'empty', 'object', 'missing']) {
    attempt(`secrets.get ${name}`, () => secret(secrets.get(name)));
}
attempt('secrets.get gives one object', () => secrets.get('token') === secrets.get('token'));

world.afterEvents.worldLoad.subscribe(() => {
    attempt('variables.names', () => variables.names);
    attempt('secrets.names', () => secrets.names);
    attempt('new SecretString', () => secret(new SecretString('made')));
    attempt('transferPlayer without a player', () => transferPlayer(undefined, { hostname: '127.0.0.1', port: 19132 }));
    record('ready for /gametest');
});

register('jsp', 'transfer', (test) => {
    start = system.currentTick;
    const player = test.spawnSimulatedPlayer({ x: 1, y: 2, z: 1 }, 'Traveler');
    record('spawned');
    attempt('transferPlayer by hostname and port', () =>
        transferPlayer(player, { hostname: '127.0.0.1', port: 19132 })
    );
    attempt('transferPlayer by NetherNet id', () => transferPlayer(player, { netherNetId: '1234' }));
    attempt('transferPlayer with no target', () => transferPlayer(player, {}));
    attempt('transferPlayer with a port out of range', () =>
        transferPlayer(player, { hostname: '127.0.0.1', port: 70000 })
    );
    system.runTimeout(() => {
        attempt('isValid after the transfers', () => player.isValid);
        test.succeed();
        system.runTimeout(() => console.warn(`DUMP end ${JSON.stringify({ pack: PACK, records: seq })}`), 5);
    }, 5);
})
    .structureLocation({ x: 0, y: -60, z: 0 })
    .maxTicks(60);
