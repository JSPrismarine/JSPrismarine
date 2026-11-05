/** Verifies a client sees naturally spawned cows standing on their valid surface. */
import assert from 'node:assert/strict';
import path from 'node:path';

import type { Scenario } from '../scenario.mts';
import { advanceTicks, sleep, vec3 } from '../scenario.mts';

/** Ticks between two spawn cycles of an animal pool, from `spawnConstants.json`. */
const ANIMAL_CYCLE_TICKS = 400;

/** Cycles to let through; each tries 24 positions around the player at a fixed world seed. */
const SPAWN_CYCLES = 5;

export const naturalSpawnPlacement: Scenario = {
    name: 'natural-spawn-placement',
    description: 'a natural cow spawn is visible to the client and stands above grass',
    serverOptions: { naturalCowSpawning: true },
    run: async ({ client, server, playerName, artifacts, log }) => {
        // The flat world's surface is at y=-60; move there before waiting for natural spawns.
        server.command(`teleport ${playerName} 0.5 -56 0.5`);

        const deadline = Date.now() + 30_000;
        for (;;) {
            const feet = vec3(await client.state(), 'feet');
            if (Math.hypot(feet[0] - 0.5, feet[2] - 0.5) < 2 && feet[1] < -50) break;
            assert.ok(Date.now() < deadline, `the client did not return to the flat surface: ${feet.join(', ')}`);
            await sleep(250);
        }

        await client.waitFor({ chunks_loaded: { radius: 2 } }, 30_000);
        // An animal pool runs one cycle every 400 ticks, so five of them are 2000. Counting
        // ticks rather than waiting for a cow to turn up makes the number of spawn attempts the
        // same on every run, whatever the machine does with the time.
        await advanceTicks(server, ANIMAL_CYCLE_TICKS * SPAWN_CYCLES);

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

        // The herd spawns up to 64 blocks out, further than the server tells a client about, so
        // asking the client for "a cow" asks where chance put the herd. Bring one to the player
        // instead: that still proves the client draws a naturally spawned cow.
        server.command('teleport @e[type=cow,limit=1] 0.5 -60 4.5');
        await client.waitFor({ entity: { matches: 'cow', radius: 80 } }, 60_000);

        await client.screenshot(path.join(artifacts, 'natural-spawn.png'));
        log('the client saw a natural cow and every cow had grass beneath it');
    }
};
