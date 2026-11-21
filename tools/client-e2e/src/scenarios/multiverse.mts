/**
 * Verifies the Multiverse addon end to end: the console creates a world with `/mv create`, which
 * is a level of its own, a player runs `/mv tp` to it and lands there, `/mv coords` names the world
 * by the alias its rules give it, `/mv tp` brings the player back to the level they joined, and
 * `/mv unload` closes the new world.
 */
import assert from 'node:assert/strict';

import { platformKey } from '../../../../packages/native-library/src/platform.ts';
import { isPublishedPlatform } from '../../../../packages/script-host/src/platform.ts';
import type { CinnabarClient } from '../client.mts';
import type { Scenario } from '../scenario.mts';
import { untilTicks, waitTicks } from '../scenario.mts';

/** The world the scenario creates. */
const WORLD = 'e2e_sky';
/** The alias `/mv modify` gives it. */
const ALIAS = 'Skylands';
/** The entry level of the e2e server, which `level-name` names. */
const ENTRY = 'e2e';

/** Whether the player's chat shows `text`. */
const chatShows = async (client: CinnabarClient, text: string): Promise<boolean> => {
    const { chat } = await client.state();
    return Array.isArray(chat) && chat.map(String).some((line) => line.includes(text));
};

export const multiverse: Scenario = {
    name: 'multiverse',
    description:
        'the console creates a world with /mv create, a player runs /mv tp to it and back, /mv coords names it by its alias, and /mv unload closes it',
    serverOptions: { addons: ['multiverse'] },
    run: async ({ client, server, playerName, log }) => {
        // A platform without a published script host build runs no scripts, as script-world-message says.
        if (!isPublishedPlatform(platformKey())) {
            log(`skipped: the script host has no build for ${platformKey()}, so the server runs no scripts`);
            return;
        }
        await client.waitFor({ chunks_loaded: { radius: 2 } }, 30_000);

        const created = server.waitForLine(new RegExp(`Created ${WORLD}\\.`), 120_000);
        server.command(`mv create ${WORLD} minecraft:flat 1`);
        await created;
        server.command(`mv modify ${WORLD} alias ${ALIAS}`);
        await waitTicks(server, 5);
        log(`created ${WORLD}`);

        /** Sends the player to a world with `/mv tp`, and waits for their client to close the loading screen. */
        const visit = async (world: string): Promise<void> => {
            const arrived = server.waitForLine(new RegExp(`${playerName} closed loading screen`), 60_000);
            await client.chat(`/mv tp ${world}`);
            await arrived;
            await client.waitFor({ chunks_loaded: { radius: 2 } }, 60_000);
            await waitTicks(server, 20);
        };

        await visit(WORLD);
        await client.chat('/mv coords');
        assert.ok(
            await untilTicks(server, 100, () => chatShows(client, `${WORLD} (${ALIAS}), minecraft:overworld`)),
            `/mv coords did not place the player in ${WORLD}`
        );
        log(`the player arrived in ${WORLD}, which /mv coords calls ${ALIAS}`);

        await visit(ENTRY);
        await client.chat('/mv coords');
        assert.ok(
            await untilTicks(server, 100, () => chatShows(client, `${ENTRY}, minecraft:overworld`)),
            `/mv coords did not place the player back in ${ENTRY}`
        );
        log(`the player came back to ${ENTRY}`);

        const unloaded = server.waitForLine(new RegExp(`Unloaded ${WORLD}\\.`), 60_000);
        server.command(`mv unload ${WORLD}`);
        await unloaded;
        log(`unloaded ${WORLD}`);
    }
};
