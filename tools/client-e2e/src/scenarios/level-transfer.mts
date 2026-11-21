/**
 * Verifies a level created while the server runs, and a player's move into it and back
 * (ADR 0029): the console creates a flat level with `/world create`, `/world tp` moves the player
 * there, where they start with an empty inventory, and back, where their items are waiting, and
 * `/world detach` closes the level.
 */
import assert from 'node:assert/strict';

import type { JspServer } from '../jsp-server.mts';
import type { Scenario } from '../scenario.mts';
import { waitTicks } from '../scenario.mts';

/** The level the scenario creates. */
const ARENA = 'e2e_arena';
/** The entry level of the e2e server, which `level-name` names. */
const ENTRY = 'e2e';

/** How many diamonds the player carries, as `/clear <player> minecraft:diamond 0` counts them. */
const diamonds = async (server: JspServer, playerName: string): Promise<number> => {
    const counted = server.waitForLine(/Found \d+ matching items?/, 10_000);
    server.command(`clear ${playerName} minecraft:diamond 0`);
    return Number(/Found (\d+)/.exec(await counted)?.[1]);
};

/** Moves the player to a level with `/world tp`, and waits for their client to close the loading screen. */
const moveTo = async (server: JspServer, playerName: string, level: string): Promise<void> => {
    const arrived = server.waitForLine(new RegExp(`${playerName} closed loading screen`), 60_000);
    server.command(`world tp ${level} ${playerName}`);
    await arrived;
    await waitTicks(server, 20);
};

export const levelTransfer: Scenario = {
    name: 'level-transfer',
    description:
        'the console creates a level, /world tp moves the player into it with a fresh inventory and back to their own, and /world detach closes it',
    run: async ({ client, server, playerName, log }) => {
        await client.waitFor({ chunks_loaded: { radius: 2 } }, 30_000);
        server.command(`replaceitem entity ${playerName} slot.hotbar 0 minecraft:diamond 3`);
        await waitTicks(server, 5);
        assert.equal(await diamonds(server, playerName), 3, 'the player holds the diamonds before leaving');

        const created = server.waitForLine(new RegExp(`Created level ${ARENA}`), 120_000);
        server.command(`world create ${ARENA} minecraft:flat 1`);
        await created;
        log(`created ${ARENA}`);

        await moveTo(server, playerName, ARENA);
        await client.waitFor({ chunks_loaded: { radius: 2 } }, 30_000);
        assert.equal(
            await diamonds(server, playerName),
            0,
            `the player arrived in ${ARENA} with the inventory of another level`
        );
        log(`the player arrived in ${ARENA} with an empty inventory`);

        await moveTo(server, playerName, ENTRY);
        await client.waitFor({ chunks_loaded: { radius: 2 } }, 30_000);
        assert.equal(await diamonds(server, playerName), 3, `the player came back to ${ENTRY} without their diamonds`);
        log(`the player came back to ${ENTRY} with their diamonds`);

        const detached = server.waitForLine(new RegExp(`Detached level ${ARENA}`), 60_000);
        server.command(`world detach ${ARENA}`);
        await detached;
        log(`detached ${ARENA}`);
    }
};
