/** Verifies `/summon` spawns nothing for an entity type its definition marks not summonable. */
import assert from 'node:assert/strict';

import type { Scenario } from '../scenario.mts';
import { sleep } from '../scenario.mts';

/** The types Bedrock refuses to summon: their definitions say `"is_summonable": false`. */
const REFUSED = ['minecraft:fishing_hook', 'minecraft:area_effect_cloud', 'jsprismarine:inert_actor'] as const;

/** Counts actors of one type visible to the client. */
const actorCount = (state: Record<string, unknown>, type: string): number => {
    const actors = state.actors;
    assert.ok(Array.isArray(actors), 'state.actors is an array');
    return actors.filter(
        (actor) => typeof actor === 'object' && actor !== null && 'type' in actor && actor.type === type
    ).length;
};

export const summonRefused: Scenario = {
    name: 'summon-refused',
    description: 'summoning a type marked not summonable spawns nothing the client can see',
    run: async ({ client, server, log }) => {
        await client.waitFor({ chunks_loaded: { radius: 2 } }, 30_000);
        const before = Object.fromEntries(
            await Promise.all(REFUSED.map(async (type) => [type, actorCount(await client.state(), type)] as const))
        );
        const pigsBefore = actorCount(await client.state(), 'minecraft:pig');

        for (const type of REFUSED) server.command(`summon ${type} 3 64 3`);
        // The console runs commands in order, so once the client sees this pig every refused
        // summon above has already been answered.
        server.command('summon minecraft:pig 3 64 3');
        const deadline = Date.now() + 15_000;
        while (actorCount(await client.state(), 'minecraft:pig') <= pigsBefore) {
            assert.ok(Date.now() < deadline, 'the client never saw the sentinel pig');
            await sleep(250);
        }

        const state = await client.state();
        for (const type of REFUSED) {
            assert.equal(actorCount(state, type), before[type], `the client was sent a summoned ${type}`);
        }
        server.command('kill @e[type=minecraft:pig]');
        log('no refused type reached the client; the sentinel pig did');
    }
};
