/** Verifies a real Bedrock client can eat: holding use on food spends one item and feeds the player. */
import assert from 'node:assert/strict';

import { lookTo, sleep, waitTicks } from '../scenario.mts';
import type { Scenario } from '../scenario.mts';

export const eating: Scenario = {
    name: 'eating',
    description: 'holding use on a golden apple finishes the meal and spends exactly one apple',
    run: async ({ client, server, playerName, log }) => {
        await client.waitFor({ chunks_loaded: { radius: 2 } }, 30_000);
        await sleep(1_000);
        server.command(`replaceitem entity ${playerName} slot.hotbar 0 minecraft:golden_apple 3`);
        await sleep(500);

        // Aim at the sky: a scenario run earlier can leave a villager in front, and using an item
        // on a villager opens its trades instead of eating.
        await lookTo(client, 0, -80);
        await client.input({ hold: ['MouseRight'] });
        // A golden apple takes 32 ticks; count them on the server, since a loaded CI runner
        // ticks slower than a wall clock second would suggest and an early release cancels the meal.
        await waitTicks(server, 60);
        await client.input({ release: ['MouseRight'] });
        await waitTicks(server, 10);

        const left = server.waitForLine(/Removed \d+ items/, 10_000);
        server.command(`clear ${playerName} minecraft:golden_apple 64`);
        const line = await left;
        log(line);
        assert.match(line, /Removed 2 items/, 'one golden apple was eaten');
    }
};
