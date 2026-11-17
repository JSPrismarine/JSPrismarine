/** Verifies a real Bedrock client can take a stack out of a chest and put one back in. */
import assert from 'node:assert/strict';
import path from 'node:path';

import { sleep, waitTicks, standAt } from '../scenario.mts';
import type { Scenario } from '../scenario.mts';

/** Waits for a screen without racing a delayed open against another click. */
const hasScreen = async (
    client: Parameters<Scenario['run']>[0]['client'],
    name: string,
    timeoutMs: number
): Promise<boolean> => {
    const deadline = Date.now() + timeoutMs;
    do {
        const screens = (await client.state()).screens;
        if (Array.isArray(screens) && screens.includes(name)) return true;
        await sleep(250);
    } while (Date.now() < deadline);
    return false;
};

export const chest: Scenario = {
    name: 'chest',
    description: 'a client can take a stack out of a chest and put it back',
    run: async (context) => {
        const { client, server, playerName, artifacts, log } = context;
        server.command('fill -2 63 -2 2 63 4 minecraft:stone');
        server.command('setblock 0 64 2 minecraft:chest');
        server.command('replaceitem block 0 64 2 slot.container 0 minecraft:diamond 5');
        server.command(`clear ${playerName}`);
        const ready = server.waitForLine(/chest-fixture-ready/, 30_000);
        server.command('say chest-fixture-ready');
        await ready;

        await client.waitFor({ chunks_loaded: { radius: 2 } }, 30_000);
        await standAt(context, { x: 0.5, y: 64, z: 0.5 });
        await client.input({ look: { yaw: 0, pitch: 29, frames: 0 } });
        await client.input({ press: ['MouseRight'], press_frames: 3 });
        if (!(await hasScreen(client, 'Container', 3_000))) {
            log('retrying the open click after the client captured gameplay input');
            await client.input({ press: ['MouseRight'], press_frames: 3 });
        }
        await client.waitFor({ screen: { name: 'Container' } }, 15_000);
        await waitTicks(server, 10);
        await client.screenshot(path.join(artifacts, 'chest-open.png'));

        // The first chest slot and the first hotbar slot, at the 1280 by 720 window the runner opens.
        const chestSlot: [number, number] = [496, 255];
        const secondChestSlot: [number, number] = [532, 255];
        const hotbarSlot: [number, number] = [496, 497];

        await client.clickAt(chestSlot);
        await client.waitFrames(15);
        await client.clickAt(hotbarSlot);
        await waitTicks(server, 15);
        await client.screenshot(path.join(artifacts, 'chest-taken.png'));

        const taken = server.waitForLine(/Found \d+ matching/, 10_000);
        server.command(`clear ${playerName} minecraft:diamond 0`);
        assert.match(await taken, /Found 5/, 'the diamonds taken out of the chest reached the player');

        // And back in, into another slot.
        await client.clickAt(hotbarSlot);
        await client.waitFrames(15);
        await client.clickAt(secondChestSlot);
        await waitTicks(server, 15);
        await client.screenshot(path.join(artifacts, 'chest-returned.png'));

        const returned = server.waitForLine(/Found \d+ matching/, 10_000);
        server.command(`clear ${playerName} minecraft:diamond 0`);
        assert.match(await returned, /Found 0/, 'the diamonds put back left the player');

        await client.input({ press: ['Escape'] });
        await client.waitForScreenAbsent('Container', 5_000);
        log('took the diamonds out of the chest and put them back');
    }
};
