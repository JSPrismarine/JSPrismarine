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
 * The columns the canopy covers around a player standing in chunk 0, 0.
 *
 * The spawn pass samples four chunks each way, so this is about a third of what it reaches:
 * a roof wide enough to catch a spawn within a cycle or two, and small enough that putting it
 * up does not flood the client with block changes.
 */
const REGION = { from: -40, to: 40 };

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

        // One strip at a time, with a pause between: the whole roof in a single fill is thousands
        // of block changes in one batch, which knocks the client off the server.
        const { from, to } = REGION;
        for (let x = from; x <= to; x += LOG_SPACING) {
            const strip = Math.min(x + LOG_SPACING - 1, to);
            server.command(`fill ${x} ${CANOPY_Y} ${from} ${strip} ${CANOPY_Y} ${to} minecraft:oak_leaves`);
            // Leaves with no log within six blocks decay on a random tick, and a canopy that
            // came down while the spawn pass was running would prove nothing either way.
            server.command(`fill ${x} ${CANOPY_Y} ${from} ${x} ${CANOPY_Y} ${to} minecraft:oak_log`);
            await sleep(500);
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
