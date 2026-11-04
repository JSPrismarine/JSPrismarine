/** Verifies natural cows spawn on the ground under a leaf canopy rather than not at all. */
import assert from 'node:assert/strict';
import path from 'node:path';

import type { Scenario } from '../scenario.mts';
import { sleep, vec3 } from '../scenario.mts';

/** The y a mob stands at in the flat world: bedrock at -64, two of dirt, then the grass block. */
const SURFACE_Y = -60;

/** The canopy, high enough over the grass to leave a cow its two blocks of headroom. */
const CANOPY_Y = SURFACE_Y + 6;

/**
 * The columns the spawn pass samples around a player standing in chunk 0, 0.
 *
 * Four chunks each way, which is the simulation distance the spawner uses as its radius. The
 * whole of it is roofed over, so every cow it places comes out from under the canopy.
 */
const REGION = { from: -64, to: 79 };

/** How far apart the logs holding the canopy up stand, which is twice a leaf's decay distance. */
const LOG_SPACING = 12;

export const naturalSpawnUnderCanopy: Scenario = {
    name: 'natural-spawn-under-canopy',
    description: 'a natural cow spawns on the grass beneath a leaf canopy',
    serverOptions: { naturalCowSpawning: true },
    run: async ({ client, server, playerName, artifacts, log }) => {
        server.command(`teleport ${playerName} 0.5 ${SURFACE_Y + 4} 0.5`);

        const landed = Date.now() + 30_000;
        for (;;) {
            const feet = vec3(await client.state(), 'feet');
            if (Math.hypot(feet[0] - 0.5, feet[2] - 0.5) < 2 && feet[1] < -50) break;
            assert.ok(Date.now() < landed, `the client did not return to the flat surface: ${feet.join(', ')}`);
            await sleep(250);
        }

        await client.waitFor({ chunks_loaded: { radius: 2 } }, 30_000);

        const { from, to } = REGION;
        // One fill of the whole roof holds the tick for seconds on a loaded machine, long enough
        // for the server to drop the client, and nothing spawns without a player. Fill it row by
        // row, with a breath between rows, so the connection keeps being served.
        for (let z = from; z <= to; z += 1) {
            server.command(`fill ${from} ${CANOPY_Y} ${z} ${to} ${CANOPY_Y} ${z} minecraft:oak_leaves`);
            await sleep(30);
        }
        // Leaves with no log within six blocks decay on a random tick, and a canopy that came
        // down while the spawn pass was running would prove nothing either way.
        for (let x = from; x <= to; x += LOG_SPACING) {
            server.command(`fill ${x} ${CANOPY_Y} ${from} ${x} ${CANOPY_Y} ${to} minecraft:oak_log`);
        }

        // One animal cycle is 400 ticks and fills the pool, so each round clears the herd the
        // last one left and reads the next. The first clear also takes out the cows that spawned
        // under open sky before the roof went up, which would prove nothing.
        const deadline = Date.now() + 180_000;
        for (;;) {
            server.command('kill @e[type=cow]');
            await sleep(25_000);

            const checked = server.waitForLine(/natural-spawn-canopy-checked/, 15_000);
            server.command(
                'execute as @e[type=cow] at @s if block ~ ~-1 ~ minecraft:grass_block ' +
                    `if block ~ ${CANOPY_Y} ~ minecraft:oak_leaves run say natural-spawn-canopy-found`
            );
            server.command('say natural-spawn-canopy-checked');
            await checked;

            if (server.lines.some((line) => line.includes('natural-spawn-canopy-found'))) break;
            assert.ok(Date.now() < deadline, 'no natural cow ever stood on the grass under the canopy');
        }

        await client.waitFor({ entity: { matches: 'cow', radius: 80 } }, 60_000);
        await client.screenshot(path.join(artifacts, 'natural-spawn-under-canopy.png'));
        log('a natural cow stood on the grass under the canopy, and the client saw one');
    }
};
