/** Verifies spectators leave shared drops available for an eligible player. */
import assert from 'node:assert/strict';

import type { Scenario } from '../scenario.mts';
import { placeBlockAndWait, sleep, standAt, vec3, waitTicks } from '../scenario.mts';

/** Counts dropped items drawn by the client. */
const drops = (state: Record<string, unknown>): number => {
    const actors = state.actors;
    assert.ok(Array.isArray(actors), 'state.actors is an array');
    return actors.filter(
        (actor) => typeof actor === 'object' && actor !== null && 'type' in actor && actor.type === 'minecraft:item'
    ).length;
};

/**
 * Where the client draws the one drop, on the ground.
 *
 * A block's drop pops out with a random sideways push and can come to rest more than a block from
 * where the block stood, out of a player's reach there, so both halves stand on the drop.
 */
const dropPosition = (state: Record<string, unknown>): { x: number; z: number } => {
    const actors = state.actors;
    assert.ok(Array.isArray(actors), 'state.actors is an array');
    const drop = actors.find(
        (actor): actor is Record<string, unknown> =>
            typeof actor === 'object' && actor !== null && 'type' in actor && actor.type === 'minecraft:item'
    );
    assert.ok(drop !== undefined, 'the client draws the drop');
    const [x, , z] = vec3(drop, 'position');
    return { x, z };
};

/** A drop survives beside a spectator and is collected after switching to survival. */
export const spectatorPickup: Scenario = {
    name: 'spectator-pickup',
    description: 'spectators cannot collect drops that survival players can collect',
    run: async ({ server, client, playerName, log }) => {
        await client.waitFor({ chunks_loaded: { radius: 2 } }, 120_000);
        // Its own floor, as `gait` lays one: run first in a suite, as a retry and a pull request
        // that changes only this scenario run it, the reset between scenarios has laid none yet.
        server.command('fill -2 63 -2 2 63 2 minecraft:stone');
        await placeBlockAndWait(server, { x: 2, y: 63, z: 2 }, 'minecraft:stone');
        server.command('kill @e[type=item]');
        server.command(`clear ${playerName}`);
        await standAt({ server, client, playerName }, { x: 0.5, y: 64, z: 0.5 });
        server.command(`gamemode spectator ${playerName}`);
        await waitTicks(server, 10);
        server.command('setblock 0 64 0 minecraft:dirt');
        server.command('setblock 0 64 0 minecraft:air destroy');
        await waitTicks(server, 40);
        // On the drop wherever it came to rest, so it stays because the player is a spectator and
        // not because the drop slid out of reach.
        const drop = dropPosition(await client.state());
        await standAt({ server, client, playerName }, { ...drop, y: 64 });
        await waitTicks(server, 20);
        assert.equal(drops(await client.state()), 1, 'the spectator leaves the drop visible');
        const empty = server.waitForLine(/Removed \d+ items|Could not/, 10_000);
        server.command(`clear ${playerName} minecraft:dirt 64`);
        assert.match(await empty, /Removed 0 items/, 'the spectator inventory received no dirt');

        server.command(`gamemode survival ${playerName}`);
        await standAt({ server, client, playerName }, { ...drop, y: 64 });
        const deadline = Date.now() + 15_000;
        while (drops(await client.state()) > 0) {
            assert.ok(Date.now() < deadline, 'the drop was not collected in survival');
            await sleep(250);
        }
        const collected = server.waitForLine(/Removed \d+ items|Could not/, 10_000);
        server.command(`clear ${playerName} minecraft:dirt 64`);
        assert.match(await collected, /Removed 1 items/, 'survival collected the preserved drop');
        log('the spectator preserved the drop and survival collected it');
    }
};
