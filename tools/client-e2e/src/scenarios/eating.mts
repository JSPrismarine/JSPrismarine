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

        // The client keeps the use held and starts another apple as soon as one is done, so the
        // release has to follow the first meal rather than a fixed count of ticks after it: on a
        // starved runner the second apple is eaten before a release that waits for 60 ticks.
        const applesLeft = async (): Promise<number> => {
            const counted = server.waitForLine(/Found \d+ matching/, 10_000);
            server.command(`clear ${playerName} minecraft:golden_apple 0`);
            return Number(/Found (\d+) matching/.exec(await counted)?.[1]);
        };
        const deadline = Date.now() + 120_000;
        while ((await applesLeft()) > 2) {
            assert.ok(Date.now() < deadline, 'the first golden apple was never eaten');
            await waitTicks(server, 2);
        }
        await client.input({ release: ['MouseRight'] });
        await waitTicks(server, 40);

        assert.equal(await applesLeft(), 2, 'one golden apple was eaten');
        log('exactly one golden apple was eaten');
    }
};
