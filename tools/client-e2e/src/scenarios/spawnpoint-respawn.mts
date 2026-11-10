/** Verifies a player respawns at a spawn point of their own, in the dimension it was set in. */
import assert from 'node:assert/strict';

import type { Scenario } from '../scenario.mts';
import { screenContaining, sleep, waitTicks } from '../scenario.mts';

const NETHER = [1, 'minecraft:the_nether', 'Nether'];
/** On the flat Nether's floor, which tops out at y 3. */
const POINT = { x: 4, y: 4, z: 4 };
/** Where the Overworld half of the dimensions scenario left its stone pad. */
const PAD = { x: 8, y: 64, z: 8 };

export const spawnpointRespawn: Scenario = {
    name: 'spawnpoint-respawn',
    description: 'a player whose spawn point is in the Nether respawns there after dying in the Overworld',
    run: async ({ client, server, playerName, log }) => {
        server.command(`execute in minecraft:the_nether run spawnpoint ${playerName} ${POINT.x} ${POINT.y} ${POINT.z}`);
        await waitTicks(server, 5);
        server.command(`kill ${playerName}`);
        const deathScreen = await screenContaining(client, 'Death');

        // The death screen ignores clicks for a moment after it opens.
        await waitTicks(server, 30);
        await client.input({ pointer: [640, 510], press: ['MouseLeft'], press_frames: 3 });
        await client.input({ release_all: true });
        await client.waitForScreenAbsent(deathScreen, 15_000);

        const arrivalBy = Date.now() + 30_000;
        for (;;) {
            const { dimension } = await client.state();
            if (NETHER.some((value) => value === dimension)) break;
            assert.ok(Date.now() < arrivalBy, `the player respawned outside the Nether: ${JSON.stringify(dimension)}`);
            await sleep(250);
        }
        await client.waitForScreenAbsent('Loading', 30_000);

        const healthBy = Date.now() + 15_000;
        for (;;) {
            const health = (await client.state()).health as { current?: unknown } | undefined;
            if (typeof health?.current === 'number' && health.current > 0) break;
            assert.ok(
                Date.now() < healthBy,
                `player never regained health after respawning: ${JSON.stringify(health)}`
            );
            await sleep(250);
        }

        const feet = (await client.state()).feet as number[] | undefined;
        assert.ok(
            Array.isArray(feet) &&
                Math.abs(feet[0]! - POINT.x) < 0.5 &&
                Math.abs(feet[1]! - POINT.y) < 0.5 &&
                Math.abs(feet[2]! - POINT.z) < 0.5,
            `the player respawned away from their spawn point ${JSON.stringify(POINT)}: feet ${JSON.stringify(feet)}`
        );
        log(`respawned at the Nether spawn point, feet ${JSON.stringify(feet)}`);

        // Back to the Overworld, with a spawn point there, so a later death does not land in the Nether.
        server.command(`execute in minecraft:overworld run spawnpoint ${playerName} ${PAD.x} ${PAD.y} ${PAD.z}`);
        server.command(`execute in minecraft:overworld run teleport ${playerName} ${PAD.x} ${PAD.y} ${PAD.z}`);
        const homeBy = Date.now() + 30_000;
        while ((await client.state()).dimension !== 0 && Date.now() < homeBy) await sleep(250);
        await client.waitForScreenAbsent('Loading', 30_000);
    }
};
