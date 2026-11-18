/**
 * The `players` scenario: the player events and the members of a player. A behavior pack
 * scenario has no client to join, so the pack registers the GameTest `jsp:players`, and the
 * capture runs it with `/gametest run` once the pack is ready. The test spawns a simulated
 * player, reads and writes it, and removes it. `structures/jsp/players.mcstructure` is the test's
 * 3 by 3 by 3 structure of air.
 *
 * Ticks are counted from the tick the test starts, which depends on when the console command
 * arrives.
 *
 * `packages/parity/src/scripting/record.ts` defines the format.
 */

import { ItemStack, Player, system, world } from '@minecraft/server';
import { register } from '@minecraft/server-gametest';

const PACK = 'players';
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

/** A vector as plain data, which the record can hold. */
const vector = ({ x, y, z }) => ({ x, y, z });

world.afterEvents.playerJoin.subscribe((event) =>
    record('world.afterEvents.playerJoin', { value: { playerId: typeof event.playerId, playerName: event.playerName } })
);
world.afterEvents.playerSpawn.subscribe((event) =>
    record('world.afterEvents.playerSpawn', { value: { player: event.player.name, initialSpawn: event.initialSpawn } })
);
world.beforeEvents.playerLeave.subscribe((event) =>
    record('world.beforeEvents.playerLeave', { value: { player: event.player.name } })
);
world.afterEvents.playerLeave.subscribe((event) =>
    record('world.afterEvents.playerLeave', {
        value: { playerId: typeof event.playerId, playerName: event.playerName }
    })
);

register('jsp', 'players', (test) => {
    start = system.currentTick;
    const player = test.spawnSimulatedPlayer({ x: 1, y: 2, z: 1 }, 'Tester');
    record('spawned');
    attempt('a Player instance', () => player instanceof Player);
    attempt('world.getAllPlayers', () => world.getAllPlayers().map((each) => each.name));
    attempt('world.getAllPlayers holds the same object', () => world.getAllPlayers()[0] === world.getAllPlayers()[0]);
    attempt('world.getPlayers by name', () => world.getPlayers({ name: 'Tester' }).length);
    attempt('world.getPlayers by another name', () => world.getPlayers({ name: 'Someone' }).length);
    attempt('world.getPlayers by type', () => world.getPlayers({ type: 'minecraft:player' }).length);
    attempt('name', () => player.name);
    attempt('typeId', () => player.typeId);
    attempt('nameTag', () => player.nameTag);
    attempt('id is a string', () => typeof player.id);
    attempt('isValid', () => player.isValid);
    attempt('dimension', () => player.dimension.id);
    attempt('getGameMode', () => player.getGameMode());
    attempt('setGameMode creative', () => {
        player.setGameMode('Creative');
        return player.getGameMode();
    });
    attempt('selectedSlotIndex', () => player.selectedSlotIndex);
    attempt('set selectedSlotIndex', () => {
        player.selectedSlotIndex = 4;
        return player.selectedSlotIndex;
    });
    attempt('set selectedSlotIndex out of range', () => {
        player.selectedSlotIndex = 9;
        return player.selectedSlotIndex;
    });
    attempt('isSneaking', () => player.isSneaking);
    attempt('world.getEntity finds the player', () => world.getEntity(player.id) === player);
    attempt('Dimension.getPlayers', () => player.dimension.getPlayers().map((each) => each.name));
    attempt('sendMessage', () => player.sendMessage('hello'));
    attempt('addTag', () => player.addTag('tested'));
    attempt('hasTag', () => player.hasTag('tested'));
    attempt('runCommand', () => player.runCommand('tag @s add commanded').successCount);
    attempt('getTags after runCommand', () => player.getTags().sort());
    const container = player.getComponent('minecraft:inventory').container;
    attempt('inventory size', () => container.size);
    attempt('inventory emptySlotsCount', () => container.emptySlotsCount);
    attempt('inventory setItem', () => container.setItem(0, new ItemStack('minecraft:apple', 3)));
    attempt('inventory getItem', () => {
        const item = container.getItem(0);
        return { typeId: item.typeId, amount: item.amount };
    });
    const target = test.worldLocation({ x: 2, y: 2, z: 2 });
    attempt('teleport', () => player.teleport({ x: target.x + 0.5, y: target.y, z: target.z + 0.5 }));
    attempt('location after teleport, from the target', () => {
        const { x, y, z } = player.location;
        return vector({ x: x - target.x, y: y - target.y, z: z - target.z });
    });
    system.runTimeout(() => {
        record('removing');
        test.removeSimulatedPlayer(player);
        attempt('isValid after removal', () => player.isValid);
        system.runTimeout(() => {
            attempt('isValid later', () => player.isValid);
            attempt('name later', () => player.name);
            attempt('world.getAllPlayers later', () => world.getAllPlayers().length);
            test.succeed();
            system.runTimeout(() => console.warn(`DUMP end ${JSON.stringify({ pack: PACK, records: seq })}`), 5);
        }, 5);
    }, 5);
})
    .structureLocation({ x: 0, y: -60, z: 0 })
    .maxTicks(60);

record('ready for /gametest');
