/** Verifies an entity the server spawns appears on the client and disappears when it is removed. */
import assert from 'node:assert/strict';

import type { Scenario } from '../scenario.mts';
import { sleep } from '../scenario.mts';

/** Counts actors of one type visible to the client. */
const actorCount = (state: Record<string, unknown>, type: string): number => {
    const actors = state.actors;
    assert.ok(Array.isArray(actors), 'state.actors is an array');
    return actors.filter(
        (actor) => typeof actor === 'object' && actor !== null && 'type' in actor && actor.type === type
    ).length;
};

export const summonEntity: Scenario = {
    name: 'summon-entity',
    description: 'a summoned pig is visible to the client and gone after it is killed',
    run: async ({ client, server, log }) => {
        await client.waitFor({ chunks_loaded: { radius: 2 } }, 30_000);
        const before = actorCount(await client.state(), 'minecraft:pig');

        server.command('summon minecraft:pig 3 64 3');
        let deadline = Date.now() + 15_000;
        while (actorCount(await client.state(), 'minecraft:pig') <= before) {
            assert.ok(Date.now() < deadline, 'the client never saw the summoned pig');
            await sleep(250);
        }

        server.command('kill @e[type=minecraft:pig]');
        deadline = Date.now() + 15_000;
        while (actorCount(await client.state(), 'minecraft:pig') > before) {
            assert.ok(Date.now() < deadline, 'the pig stayed visible after it was killed');
            await sleep(250);
        }
        log('the pig appeared and then disappeared on the client');
    }
};
