/** Verifies the client sees death, can respawn from the death screen, and returns to play. */
import assert from 'node:assert/strict';

import type { Scenario } from '../scenario.mts';
import { readHealth, screenContaining, sleep, vec3, waitTicks } from '../scenario.mts';

export const deathRespawn: Scenario = {
    name: 'death-respawn',
    description: 'dying shows the death screen, respawning restores a healthy player, and it can still teleport itself',
    run: async ({ client, server, playerName, log }) => {
        // The world spawn names the stone pad's own block, as a world whose spawn was written as
        // its top block does, so the respawn has to lift the player out of it.
        server.command('setworldspawn 0 63 0');
        server.command('fill -2 63 -2 2 63 2 minecraft:stone');
        await waitTicks(server, 5);

        // Die in the Nether, so the respawn is a change of world: that is the one a later command
        // into another dimension used to be held behind. The flat Nether's floor tops out at y 3,
        // so the player stands on it. A pad filled there before anyone arrives would find no
        // loaded chunk, and it used to land in the Overworld instead.
        server.command(`execute in minecraft:the_nether run teleport ${playerName} 0 4 0`);
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
            const health = readHealth(await client.state());
            if (health !== undefined && health.current > 0) {
                log(`respawned with ${health.current} health`);
                break;
            }
            assert.ok(
                Date.now() < deadline,
                `player never regained health after respawning: ${JSON.stringify(health)}`
            );
            await sleep(250);
        }

        const feet = vec3(await client.state(), 'feet');
        assert.ok(
            feet[1] >= 64 - 0.01,
            `the respawn stood the player inside the stone spawn block: feet ${JSON.stringify(feet)}`
        );

        // Respawned in the Overworld, the player has to be able to run a command that sends
        // them back: `@s` names them, and the change of world must not still be pending.
        server.command(`op ${playerName}`);
        await waitTicks(server, 10);
        await client.chat('/execute in minecraft:the_nether run tp @s 0 4 0');
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
