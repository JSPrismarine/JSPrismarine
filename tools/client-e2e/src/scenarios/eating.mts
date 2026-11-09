/** Verifies a real Bedrock client can eat: holding use on food spends one item per meal. */
import assert from 'node:assert/strict';

import { lookTo, sleep, waitTicks } from '../scenario.mts';
import type { Scenario } from '../scenario.mts';

export const eating: Scenario = {
    name: 'eating',
    description: 'holding use on golden apples finishes meal after meal, each spending exactly one apple',
    run: async ({ client, server, playerName, log }) => {
        await client.waitFor({ chunks_loaded: { radius: 2 } }, 30_000);
        await sleep(1_000);
        server.command(`replaceitem entity ${playerName} slot.hotbar 0 minecraft:golden_apple 3`);
        await sleep(500);

        // Aim at the sky: a scenario run earlier can leave a villager in front, and using an item
        // on a villager opens its trades instead of eating.
        await lookTo(client, 0, -80);
        await client.input({ hold: ['MouseRight'] });

        // The client keeps the use held and starts another apple as soon as one is done. The
        // server counts each meal out in its own ticks, but a release has to cross the client
        // first, and a starved client delivered it after the second apple was gone. So keep
        // holding through two meals and check each one on the server's clock instead: the count
        // is read every few ticks, far more often than the 32 a meal takes, so a meal that spent
        // more than one apple shows up as a drop of more than one between two reads.
        const applesLeft = async (): Promise<number> => {
            const counted = server.waitForLine(/Found \d+ matching/, 10_000);
            server.command(`clear ${playerName} minecraft:golden_apple 0`);
            return Number(/Found (\d+) matching/.exec(await counted)?.[1]);
        };
        const deadline = Date.now() + 120_000;
        let left = 3;
        while (left > 1) {
            const count = await applesLeft();
            assert.ok(count <= left && left - count <= 1, `${left} golden apples became ${count} in one meal`);
            if (count < left) log(`a meal finished with ${count} golden apples left`);
            left = count;
            assert.ok(Date.now() < deadline, `only ${3 - left} of two golden apples were eaten`);
            await waitTicks(server, 2);
        }
        await client.input({ release: ['MouseRight'] });
        log('each of two meals spent exactly one golden apple');
    }
};
