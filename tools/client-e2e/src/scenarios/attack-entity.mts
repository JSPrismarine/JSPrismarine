/** Verifies a client melee attack reaches the server, hurts the target, and removes it when it dies. */
import assert from 'node:assert/strict';

import type { Scenario } from '../scenario.mts';
import { lookTo, sleep, vec3, waitTicks } from '../scenario.mts';

/** Counts actors of one type visible to the client. */
const actorCount = (state: Record<string, unknown>, type: string): number => {
    const actors = state.actors;
    assert.ok(Array.isArray(actors), 'state.actors is an array');
    return actors.filter(
        (actor) => typeof actor === 'object' && actor !== null && 'type' in actor && actor.type === type
    ).length;
};

/** Whether the client draws a pig within a block of `at`, which is what a swing needs to hit. */
const pigAt = (state: Record<string, unknown>, at: readonly [number, number, number]): boolean => {
    const actors = state.actors;
    if (!Array.isArray(actors)) return false;
    return actors.some((actor: unknown) => {
        if (typeof actor !== 'object' || actor === null || !('type' in actor) || actor.type !== 'minecraft:pig') {
            return false;
        }
        const position = 'position' in actor ? actor.position : undefined;
        return (
            Array.isArray(position) &&
            typeof position[0] === 'number' &&
            typeof position[2] === 'number' &&
            Math.hypot(position[0] - at[0], position[2] - at[2]) < 1
        );
    });
};

/** Swings allowed before the pig is declared unkillable: a pig takes a handful of fist hits. */
const MAX_SWINGS = 20;

export const attackEntity: Scenario = {
    name: 'attack-entity',
    description: 'left clicking a pig in front of the player kills it and the client stops drawing it',
    run: async ({ client, server, log }) => {
        await client.waitFor({ chunks_loaded: { radius: 2 } }, 30_000);
        // The pig stands 0.9 blocks tall two blocks ahead; aim at its middle from eye height, and
        // wait for the client to report the heading so the first click does not use the old aim.
        await lookTo(client, 0, 30);

        const feet = vec3(await client.state(), 'feet');
        const front = `${feet[0]} ${feet[1]} ${feet[2] + 2}`;
        server.command(`summon minecraft:pig ${front}`);
        const deadline = Date.now() + 15_000;
        while (actorCount(await client.state(), 'minecraft:pig') === 0) {
            assert.ok(Date.now() < deadline, 'the client never saw the pig');
            await sleep(250);
        }

        // Swing until it dies. Each hit knocks the pig several blocks away, so stand it back in
        // front of the player and wait until the client draws it there before the next swing.
        // Counted in swings, not seconds: a slow host takes longer per swing but needs no more.
        const target = [feet[0], feet[1], feet[2] + 2] as const;
        let swings = 0;
        while (actorCount(await client.state(), 'minecraft:pig') > 0) {
            assert.ok(swings < MAX_SWINGS, `the pig survived ${swings} swings`);
            server.command(`teleport @e[type=minecraft:pig] ${front}`);
            const visibleBy = Date.now() + 15_000;
            while (!pigAt(await client.state(), target)) {
                if (actorCount(await client.state(), 'minecraft:pig') === 0) break;
                assert.ok(Date.now() < visibleBy, 'the client never drew the pig back in front of the player');
                await sleep(100);
            }
            await client.input({ press: ['MouseLeft'], press_frames: 2 });
            swings++;
            await waitTicks(server, 10);
        }
        await client.input({ release_all: true });

        const remaining = server.waitForLine(/Found \d+ entities?|No entity was found/, 10_000);
        server.command('testfor @e[type=minecraft:pig]');
        assert.match(await remaining, /No entity was found|Found 0/, 'the server still has the pig');
        log('the pig died from the client attacks and left the client view');
    }
};
