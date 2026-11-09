/** Verifies a dimension change sent to a dead player waits for the respawn and then lands. */
import assert from 'node:assert/strict';

import type { Scenario } from '../scenario.mts';
import { screenContaining, sleep, waitTicks } from '../scenario.mts';

const NETHER = [1, 'minecraft:the_nether', 'Nether'];

export const teleportWhileDead: Scenario = {
    name: 'teleport-while-dead',
    description: 'a teleport into the Nether while the player is dead lands once they respawn',
    run: async ({ client, server, playerName, log }) => {
        server.command(`kill ${playerName}`);
        const deathScreen = await screenContaining(client, 'Death');

        // The change used to go out under the death screen at once. A client that left its
        // loading screen unopened then sat on "Loading" for a minute after respawning, and the
        // server held every later change of world behind it.
        server.command(`execute in minecraft:the_nether run teleport ${playerName} 0 4 0`);
        await waitTicks(server, 30);
        const whileDead = (await client.state()).dimension;
        assert.ok(!NETHER.some((value) => value === whileDead), 'the dead player changed dimension before respawning');

        await client.input({ pointer: [640, 510], press: ['MouseLeft'], press_frames: 3 });
        await client.input({ release_all: true });
        await client.waitForScreenAbsent(deathScreen, 15_000);

        const deadline = Date.now() + 30_000;
        for (;;) {
            const { dimension } = await client.state();
            if (NETHER.some((value) => value === dimension)) break;
            assert.ok(
                Date.now() < deadline,
                `the respawned player never reached the Nether: ${JSON.stringify(dimension)}`
            );
            await sleep(250);
        }
        await client.waitForScreenAbsent('Loading', 30_000);
        await client.waitFor({ chunks_loaded: { radius: 2 } }, 60_000);
        log('the teleport held over the death landed in the Nether after the respawn');
    }
};
