/** Verifies a real Bedrock client opens a villager's trade screen with the offers the server sent. */
import assert from 'node:assert/strict';
import path from 'node:path';

import { lookTo, sleep, waitTicks } from '../scenario.mts';
import type { Scenario } from '../scenario.mts';

/** Sends a left click and lets Cinnabar release the button before the next click. */
const click = async (client: Parameters<Scenario['run']>[0]['client'], pointer: [number, number]): Promise<void> => {
    await client.input({ pointer });
    await sleep(100);
    await client.input({ press: ['MouseLeft'], press_frames: 3 });
    await sleep(100);
    await client.input({ release: ['MouseLeft'] });
    await sleep(100);
};

export const villagerTrade: Scenario = {
    name: 'villager-trade',
    description: 'right-clicking a villager opens its trade screen on the client',
    run: async ({ client, server, playerName, artifacts, log }) => {
        server.command('fill -2 63 -2 4 63 6 minecraft:stone');
        server.command(`replaceitem entity ${playerName} slot.hotbar 0 minecraft:emerald 2`);
        server.command(`teleport ${playerName} 0.5 64 0.5`);
        server.command('summon minecraft:villager_v2 0.5 64 2.5');

        await client.waitFor({ chunks_loaded: { radius: 2 } }, 30_000);
        await sleep(1_000);
        await lookTo(client, 0, 0);

        const deadline = Date.now() + 15_000;
        let screens: unknown;
        for (;;) {
            await client.input({ press: ['MouseRight'], press_frames: 3 });
            await sleep(750);
            screens = (await client.state()).screens;
            if (Array.isArray(screens) && screens.includes('Container')) break;
            assert.ok(Date.now() < deadline, `no screen opened when the villager was used: ${JSON.stringify(screens)}`);
        }
        await client.screenshot(path.join(artifacts, 'villager-trade-open.png'));
        log(`the client opened: ${JSON.stringify(screens)}`);

        // Choose the offer, put one emerald in the first payment slot, and take the bread.
        await click(client, [460, 237]);
        await click(client, [636, 497]);
        await click(client, [645, 285]);
        await sleep(500);
        await client.screenshot(path.join(artifacts, 'villager-trade-paid.png'));
        await click(client, [782, 285]);
        await click(client, [672, 497]);
        await sleep(500);
        await client.screenshot(path.join(artifacts, 'villager-trade-done.png'));

        await client.input({ press: ['Escape'] });
        await client.waitForScreenAbsent('Container', 5_000);
        await waitTicks(server, 15);

        // The trade handed over four bread. How the leftover emeralds are split between the
        // client's cursor and the payment slot is the client's own business, so only the bread
        // is counted.
        const bread = server.waitForLine(/Removed \d+ items/, 10_000);
        server.command(`clear ${playerName} minecraft:bread 64`);
        assert.match(await bread, /Removed 4 items/, 'the trade handed over four bread');
        log('took four bread from the villager for an emerald');
    }
};
