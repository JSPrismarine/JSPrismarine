/** Verifies a client sees naturally spawned cows standing on their valid surface. */
import assert from 'node:assert/strict';
import path from 'node:path';

import type { Scenario } from '../scenario.mts';
import { sleep, vec3 } from '../scenario.mts';

export const naturalSpawnPlacement: Scenario = {
    name: 'natural-spawn-placement',
    description: 'a natural cow spawn is visible to the client and stands above grass',
    run: async ({ client, server, playerName, artifacts, log }) => {
        // Earlier scenarios leave the player at y=64, far above the flat world's y=-60 surface.
        server.command(`teleport ${playerName} 0.5 -56 0.5`);

        const deadline = Date.now() + 30_000;
        for (;;) {
            const feet = vec3(await client.state(), 'feet');
            if (Math.hypot(feet[0] - 0.5, feet[2] - 0.5) < 2 && feet[1] < -50) break;
            assert.ok(Date.now() < deadline, `the client did not return to the flat surface: ${feet.join(', ')}`);
            await sleep(250);
        }

        await client.waitFor({ chunks_loaded: { radius: 2 } }, 30_000);
        await client.waitFor({ entity: { matches: 'cow', radius: 80 } }, 120_000);

        const found = server.waitForLine(/Found [1-9]\d* entities/, 10_000);
        server.command('testfor @e[type=cow]');
        const result = await found;

        assert.match(result, /Found [1-9]\d* entities/, `the server found a natural cow: ${result}`);

        const checked = server.waitForLine(/natural-spawn-placement-checked/, 10_000);
        server.command(
            'execute as @e[type=cow] at @s unless block ~ ~-1 ~ minecraft:grass_block run say natural-spawn-placement-unsupported'
        );
        server.command('say natural-spawn-placement-checked');
        await checked;

        assert.ok(
            !server.lines.some((line) => line.includes('natural-spawn-placement-unsupported')),
            'all natural cows stand above grass'
        );

        await client.screenshot(path.join(artifacts, 'natural-spawn.png'));
        log('the client saw a natural cow and every cow had grass beneath it');
    }
};
