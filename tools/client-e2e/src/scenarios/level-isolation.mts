/**
 * Verifies a second level runs its own mobs and shows them only to its own players.
 *
 * Each level has an Overworld. When the entity runtime was keyed by dimension alone, both shared
 * one store, one change log and one spawn cycle, and that cycle read the default level's game
 * rules, so the second level spawned nothing of its own and whatever it held was shown to the
 * default level's players.
 *
 * The mobs come from the second level's natural spawning, which the suite leaves on there: the
 * runner turns `spawn_mobs` off in the default level only. Neither `/summon` nor a spawn egg can
 * place one: the command host and the content item actions both find a world by its dimension
 * alone, which is the default level's.
 */
import assert from 'node:assert/strict';

import type { CinnabarClient } from '../client.mts';
import { SECOND_LEVEL } from '../jsp-server.mts';
import type { Scenario } from '../scenario.mts';
import { sleep, waitTicks } from '../scenario.mts';

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/** The actors one client is shown. */
const actorsOf = async (client: CinnabarClient): Promise<Record<string, unknown>[]> => {
    const { actors } = await client.state();
    assert.ok(Array.isArray(actors), 'state.actors is an array');
    return actors.filter(isRecord);
};

/** The actors a client is shown other than players, which here are the spawned mobs. */
const mobCount = async (client: CinnabarClient): Promise<number> =>
    (await actorsOf(client)).filter((actor) => actor.type !== 'minecraft:player').length;

const shows = async (client: CinnabarClient, name: string): Promise<boolean> =>
    (await actorsOf(client)).some((actor) => actor.name === name);

/** Polls `check` until it holds, failing with `message` after `ms`. */
const waitUntil = async (check: () => Promise<boolean>, ms: number, message: string): Promise<void> => {
    const deadline = Date.now() + ms;
    while (!(await check())) {
        assert.ok(Date.now() < deadline, message);
        await sleep(250);
    }
};

export const levelIsolation: Scenario = {
    name: 'level-isolation',
    description: 'a second level spawns its own mobs and shows them only to its own players',
    serverOptions: { secondLevel: true },
    run: async ({ client, server, createClient, playerName, log }) => {
        await client.waitFor({ chunks_loaded: { radius: 2 } }, 30_000);
        const observer = await createClient('jsp-e2e-observer');
        await observer.waitFor({ chunks_loaded: { radius: 2 } }, 30_000);
        await waitUntil(() => shows(observer, playerName), 30_000, 'the observer never saw the player');

        // The change is carried out by the player's next input step and finishes when the client
        // closes the loading screen it opened for it.
        const arrived = server.waitForLine(new RegExp(`${playerName} closed loading screen`), 30_000);
        server.command(`execute as ${playerName} run debug changeWorld ${SECOND_LEVEL}`);
        await arrived;
        await waitUntil(
            async () => !(await shows(observer, playerName)),
            30_000,
            'the observer still saw the player after it moved to the second level'
        );

        const observerBefore = await mobCount(observer);
        await waitUntil(
            async () => (await mobCount(client)) > 0,
            60_000,
            'the player in the second level was never shown a mob of its natural spawning'
        );
        const shown = await mobCount(client);

        // Long enough for the default level's replication to have shown those mobs, had they
        // reached it.
        await waitTicks(server, 20);
        const observerAfter = await mobCount(observer);
        assert.equal(
            observerAfter,
            observerBefore,
            `the observer in the default level was shown ${observerAfter - observerBefore} mob(s) from the second level`
        );
        log(`the second level showed its player ${shown} mob(s) of its own and the default level showed none`);
    }
};
