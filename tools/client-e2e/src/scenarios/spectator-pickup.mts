/** Verifies spectators leave shared drops available for an eligible player. */
import assert from 'node:assert/strict';

import type { Scenario } from '../scenario.mts';
import { sleep, standAt, waitTicks } from '../scenario.mts';

/** Counts dropped items drawn by the client. */
const drops = (state: Record<string, unknown>): number => {
    const actors = state.actors;
    assert.ok(Array.isArray(actors), 'state.actors is an array');
    return actors.filter(
        (actor) => typeof actor === 'object' && actor !== null && 'type' in actor && actor.type === 'minecraft:item'
    ).length;
};

/** A drop survives beside a spectator and is collected after switching to survival. */
export const spectatorPickup: Scenario = {
    name: 'spectator-pickup',
    description: 'spectators cannot collect drops that survival players can collect',
    run: async ({ server, client, playerName, log }) => {
        await client.waitFor({ chunks_loaded: { radius: 2 } }, 120_000);
        server.command('kill @e[type=item]');
        server.command(`clear ${playerName}`);
        await standAt({ server, client, playerName }, { x: 0.5, y: 64, z: 0.5 });
        server.command(`gamemode spectator ${playerName}`);
        await waitTicks(server, 10);
        server.command('setblock 0 64 0 minecraft:dirt');
        server.command('setblock 0 64 0 minecraft:air destroy');
        await waitTicks(server, 40);
        assert.equal(drops(await client.state()), 1, 'the spectator leaves the drop visible');
        const empty = server.waitForLine(/Removed \d+ items|Could not/, 10_000);
        server.command(`clear ${playerName} minecraft:dirt 64`);
        assert.match(await empty, /Removed 0 items/, 'the spectator inventory received no dirt');

        server.command(`gamemode survival ${playerName}`);
        await standAt({ server, client, playerName }, { x: 0.5, y: 64, z: 0.5 });
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
