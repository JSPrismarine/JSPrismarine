/** Verifies a client melee attack reaches the server, hurts the target, and removes it when it dies. */
import assert from 'node:assert/strict';

import type { Scenario } from '../scenario.mts';
import { sleep, vec3, waitTicks } from '../scenario.mts';

/** Counts actors of one type visible to the client. */
const actorCount = (state: Record<string, unknown>, type: string): number => {
    const actors = state.actors;
    assert.ok(Array.isArray(actors), 'state.actors is an array');
    return actors.filter(
        (actor) => typeof actor === 'object' && actor !== null && 'type' in actor && actor.type === type
    ).length;
};

export const attackEntity: Scenario = {
    name: 'attack-entity',
    description: 'left clicking a pig in front of the player kills it and the client stops drawing it',
    run: async ({ client, server, log }) => {
        await client.waitFor({ chunks_loaded: { radius: 2 } }, 30_000);
        // The pig stands 0.9 blocks tall two blocks ahead; aim at its middle from eye height.
        await client.input({ look: { yaw: 0, pitch: 30, frames: 0 } });

        const feet = vec3(await client.state(), 'feet');
        const front = `${feet[0]} ${feet[1]} ${feet[2] + 2}`;
        server.command(`summon minecraft:pig ${front}`);
        let deadline = Date.now() + 15_000;
        while (actorCount(await client.state(), 'minecraft:pig') === 0) {
            assert.ok(Date.now() < deadline, 'the client never saw the pig');
            await sleep(250);
        }

        // Swing until it dies. Each hit knocks the pig several blocks away, so stand it back in
        // front of the player and let the client see it there before the next swing.
        deadline = Date.now() + 40_000;
        while (actorCount(await client.state(), 'minecraft:pig') > 0) {
            assert.ok(Date.now() < deadline, 'the pig survived every swing');
            server.command(`teleport @e[type=minecraft:pig] ${front}`);
            await waitTicks(server, 8);
            await client.input({ press: ['MouseLeft'], press_frames: 1 });
            await waitTicks(server, 14);
        }
        await client.input({ release_all: true });

        const remaining = server.waitForLine(/Found \d+ entities?|No entity was found/, 10_000);
        server.command('testfor @e[type=minecraft:pig]');
        assert.match(await remaining, /No entity was found|Found 0/, 'the server still has the pig');
        log('the pig died from the client attacks and left the client view');
    }
};
