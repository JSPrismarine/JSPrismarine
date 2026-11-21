/**
 * The `admin-server` scenario: `@minecraft/server-admin`'s allow list, `opPlayer`, `deopPlayer`
 * and `kickPlayer`, and the dedicated server utilities. A behavior pack scenario has no client,
 * so the pack registers the GameTest `jsp:server`, which the capture runs with `/gametest run`
 * once the pack is ready, and acts on the simulated player the test spawns. The pack stops the
 * server with `dedicatedServer.stopServer()` once it has written its end line.
 *
 * Ticks are counted from the tick the pack loads until the test starts, and from the test's start
 * after that, which depends on when the console command arrives.
 *
 * `packages/parity/src/scripting/record.ts` defines the format.
 */

import { system, world } from '@minecraft/server';
import { dedicatedServer, deopPlayer, kickPlayer, opPlayer } from '@minecraft/server-admin';
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
        const value = call();
        record(event, { value: value === undefined ? 'undefined' : value });
    } catch (error) {
        record(event, { error: String(error) });
    }
};

/** An allow list entry as plain data. */
const entry = (each) => ({ name: each.name, xuid: each.xuid, ignoresPlayerLimit: each.ignoresPlayerLimit });

attempt('dedicatedServer in early execution', () => dedicatedServer.constructor.name);
attempt('allowList in early execution', () => dedicatedServer.allowList.enabled);
attempt('reloadPermissions in early execution', () => dedicatedServer.reloadPermissions());

world.afterEvents.worldLoad.subscribe(() => {
    attempt('allowList class', () => dedicatedServer.allowList.constructor.name);
    attempt('levelStorage class', () => dedicatedServer.levelStorage.constructor.name);
    attempt('enabled', () => dedicatedServer.allowList.enabled);
    attempt('entries at the start', () => dedicatedServer.allowList.entries.map(entry));
    attempt('contains Steve', () => dedicatedServer.allowList.contains({ name: 'Steve' }));
    attempt('add Steve', () => dedicatedServer.allowList.add({ name: 'Steve' }));
    attempt('contains Steve after add', () => dedicatedServer.allowList.contains({ name: 'Steve' }));
    attempt('contains steve in lower case', () => dedicatedServer.allowList.contains({ name: 'steve' }));
    attempt('add Steve again', () => dedicatedServer.allowList.add({ name: 'Steve' }));
    attempt('add Alex ignoring the player limit', () => dedicatedServer.allowList.add({ name: 'Alex' }, true));
    attempt('add by xuid', () => dedicatedServer.allowList.add({ xuid: '2535400000000001' }));
    attempt('add with neither name nor xuid', () => dedicatedServer.allowList.add({}));
    attempt('contains by xuid', () => dedicatedServer.allowList.contains({ xuid: '2535400000000001' }));
    attempt('entries after the adds', () => dedicatedServer.allowList.entries.map(entry));
    attempt('remove Steve', () => dedicatedServer.allowList.remove({ name: 'Steve' }));
    attempt('remove Steve again', () => dedicatedServer.allowList.remove({ name: 'Steve' }));
    attempt('set enabled', () => {
        dedicatedServer.allowList.enabled = true;
        return dedicatedServer.allowList.enabled;
    });
    attempt('clear enabled', () => {
        dedicatedServer.allowList.enabled = false;
        return dedicatedServer.allowList.enabled;
    });
    attempt('reloadFile', () => dedicatedServer.allowList.reloadFile());
    attempt('entries after reloadFile', () => dedicatedServer.allowList.entries.map(entry));
    attempt('clear', () => dedicatedServer.allowList.clear());
    attempt('entries after clear', () => dedicatedServer.allowList.entries.map(entry));
    attempt('reloadPermissions', () => dedicatedServer.reloadPermissions());
    attempt('reloadScriptingConfig', () => dedicatedServer.reloadScriptingConfig());
    attempt('reloadCDNConfig', () => dedicatedServer.reloadCDNConfig());
    attempt('opPlayer without a player', () => opPlayer(undefined));
    attempt('kickPlayer without a player', () => kickPlayer(undefined));
    record('ready for /gametest');
});

register('jsp', 'server', (test) => {
    start = system.currentTick;
    const player = test.spawnSimulatedPlayer({ x: 1, y: 2, z: 1 }, 'Admin');
    record('spawned');
    attempt('permission level at the start', () => player.playerPermissionLevel);
    attempt('opPlayer', () => opPlayer(player));
    attempt('permission level after opPlayer', () => player.playerPermissionLevel);
    attempt('opPlayer again', () => opPlayer(player));
    attempt('deopPlayer', () => deopPlayer(player));
    attempt('permission level after deopPlayer', () => player.playerPermissionLevel);
    attempt('deopPlayer again', () => deopPlayer(player));
    attempt('allowList add a player', () => dedicatedServer.allowList.add(player));
    attempt('allowList contains the player', () => dedicatedServer.allowList.contains(player));
    attempt('allowList entries with the player', () => dedicatedServer.allowList.entries.map(entry));
    attempt('allowList remove the player', () => dedicatedServer.allowList.remove(player));
    attempt('kickPlayer', () => kickPlayer(player, 'bye'));
    system.runTimeout(() => {
        attempt('isValid after the kick', () => player.isValid);
        test.succeed();
        system.runTimeout(() => {
            console.warn(`DUMP end ${JSON.stringify({ pack: PACK, records: seq })}`);
            system.runTimeout(() => dedicatedServer.stopServer(), 5);
        }, 5);
    }, 5);
})
    .structureLocation({ x: 0, y: -60, z: 0 })
    .maxTicks(60);
