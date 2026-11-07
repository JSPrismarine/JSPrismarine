/** Verifies the client sees death, can respawn from the death screen, and returns to play. */
import assert from 'node:assert/strict';

import type { Scenario } from '../scenario.mts';
import { sleep, waitTicks } from '../scenario.mts';

/** Polls for a screen whose name contains `fragment`; returns its full name. */
const screenContaining = async (
    client: Parameters<Scenario['run']>[0]['client'],
    fragment: string
): Promise<string> => {
    const deadline = Date.now() + 15_000;
    for (;;) {
        const screens = (await client.state()).screens;
        const found = Array.isArray(screens)
            ? screens.find((screen): screen is string => typeof screen === 'string' && screen.includes(fragment))
            : undefined;
        if (found !== undefined) return found;
        assert.ok(Date.now() < deadline, `no ${fragment} screen appeared; stack: ${JSON.stringify(screens)}`);
        await sleep(250);
    }
};

export const deathRespawn: Scenario = {
    name: 'death-respawn',
    description: 'dying shows the death screen, respawning restores a healthy player, and it can still teleport itself',
    run: async ({ client, server, playerName, log }) => {
        // Die in the Nether, so the respawn is a change of world: that is the one a later command
        // into another dimension used to be held behind.
        server.command('execute in minecraft:the_nether run fill -4 99 -4 4 99 4 minecraft:netherrack');
        server.command(`execute in minecraft:the_nether run teleport ${playerName} 0 100 0`);
        const there = Date.now() + 30_000;
        while ((await client.state()).dimension !== 1 && Date.now() < there) await sleep(250);
        assert.equal((await client.state()).dimension, 1, 'the client never reached the Nether');
        await waitTicks(server, 40);
        server.command(`kill ${playerName}`);
        const deathScreen = await screenContaining(client, 'Death');

        // The death screen ignores clicks for a moment after it opens.
        await waitTicks(server, 30);
        await client.input({ pointer: [640, 510], press: ['MouseLeft'], press_frames: 3 });
        await client.input({ release_all: true });
        await client.waitForScreenAbsent(deathScreen, 15_000);
        await client.waitForScreenAbsent('Loading', 30_000);

        const deadline = Date.now() + 15_000;
        for (;;) {
            const health = (await client.state()).health as { current?: unknown } | undefined;
            if (typeof health?.current === 'number' && health.current > 0) {
                log(`respawned with ${health.current} health`);
                break;
            }
            assert.ok(
                Date.now() < deadline,
                `player never regained health after respawning: ${JSON.stringify(health)}`
            );
            await sleep(250);
        }

        // Respawned in the Overworld, the player has to be able to run a command that sends
        // them back: `@s` names them, and the change of world must not still be pending.
        server.command(`op ${playerName}`);
        await waitTicks(server, 10);
        await client.chat('/execute in minecraft:the_nether run tp @s 0 100 0');
        const arrivalBy = Date.now() + 30_000;
        for (;;) {
            const dimension = (await client.state()).dimension;
            if ([1, 'minecraft:the_nether', 'Nether'].some((value) => value === dimension)) break;
            assert.ok(
                Date.now() < arrivalBy,
                `/execute in the_nether run tp @s did not move the respawned player: ${JSON.stringify(dimension)}`
            );
            await sleep(250);
        }
        log('the respawned player followed /execute in minecraft:the_nether run tp @s back into the Nether');
    }
};
