/**
 * Verifies a command run at a player in a second level acts on that level (#3024).
 *
 * The command host used to turn a command's dimension into a world of the default level, so
 * `execute as <player> at @s run summon` put the mob into the default level at the player's
 * coordinates there, where the player was not. An armor stand stands in for the mob: natural
 * spawning never makes one, so the one the client sees is the command's.
 */
import assert from 'node:assert/strict';

import type { CinnabarClient } from '../client.mts';
import { SECOND_LEVEL } from '../jsp-server.mts';
import type { Scenario } from '../scenario.mts';
import { sleep, waitTicks } from '../scenario.mts';

const SUMMONED = 'minecraft:armor_stand';

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/** How many actors of the summoned type a client is shown. */
const summonedShown = async (client: CinnabarClient): Promise<number> => {
    const { actors } = await client.state();
    assert.ok(Array.isArray(actors), 'state.actors is an array');
    return actors.filter((actor) => isRecord(actor) && actor.type === SUMMONED).length;
};

export const secondLevelSummon: Scenario = {
    name: 'second-level-summon',
    description: 'a command run at a player in a second level summons into that level',
    serverOptions: { secondLevel: true },
    run: async ({ client, server, createClient, playerName, log }) => {
        await client.waitFor({ chunks_loaded: { radius: 2 } }, 30_000);
        const observer = await createClient('jsp-e2e-summoner');
        await observer.waitFor({ chunks_loaded: { radius: 2 } }, 30_000);

        const arrived = server.waitForLine(new RegExp(`${playerName} closed loading screen`), 30_000);
        server.command(`execute as ${playerName} run debug changeWorld ${SECOND_LEVEL}`);
        await arrived;
        await client.waitFor({ chunks_loaded: { radius: 2 } }, 30_000);

        server.command(`execute as ${playerName} at @s run summon ${SUMMONED} ~2 ~ ~`);
        const deadline = Date.now() + 30_000;
        while ((await summonedShown(client)) === 0) {
            assert.ok(Date.now() < deadline, 'the player in the second level was never shown the summoned armor stand');
            await sleep(250);
        }

        // Long enough for the default level's replication to have shown it, had it gone there.
        await waitTicks(server, 20);
        assert.equal(await summonedShown(observer), 0, 'the observer in the default level was shown the armor stand');
        log('the armor stand summoned at the player stood in the second level, and only its player saw it');
        server.command(`execute as ${playerName} at @s run kill @e[type=${SUMMONED}]`);
    }
};
