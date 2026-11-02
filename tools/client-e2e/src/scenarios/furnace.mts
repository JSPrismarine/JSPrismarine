/** Verifies a real Bedrock client can move coal from its hotbar into a furnace's fuel slot. */
import assert from 'node:assert/strict';
import path from 'node:path';

import { sleep, vec3 } from '../scenario.mts';
import type { Scenario } from '../scenario.mts';

const BLOCK_REPLY = /Found the block at|The block is |That chunk is not loaded/;

/** Asks the server whether the fixture block is present. */
const furnaceReply = async (server: Parameters<Scenario['run']>[0]['server'], identifier: string): Promise<string> => {
    const reply = server.waitForLine(BLOCK_REPLY, 10_000);
    server.command(`testforblock 0 64 2 minecraft:${identifier}`);
    return reply;
};

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

/** Sends a left click and lets Cinnabar release the button before the next click. */
const click = async (client: Parameters<Scenario['run']>[0]['client'], pointer: [number, number]): Promise<void> => {
    await client.input({ pointer });
    await sleep(100);
    await client.input({ press: ['MouseLeft'], press_frames: 3 });
    await sleep(100);
    await client.input({ release: ['MouseLeft'] });
    await sleep(100);
};

export const furnace: Scenario = {
    name: 'furnace',
    description: 'a client can put coal in the furnace fuel slot',
    run: async ({ client, server, playerName, artifacts, log }) => {
        server.command('fill -2 63 -2 2 63 4 minecraft:stone');
        server.command('setblock 0 64 2 minecraft:furnace');
        server.command('replaceitem block 0 64 2 slot.container 0 minecraft:iron_ore 1');
        server.command(`replaceitem entity ${playerName} slot.hotbar 0 minecraft:coal 1`);
        server.command(`teleport ${playerName} 0.5 64 0.5`);

        const ready = server.waitForLine(/furnace-fixture-ready/, 30_000);
        server.command('say furnace-fixture-ready');
        await ready;

        const cold = await furnaceReply(server, 'furnace');
        assert.match(cold, /Found the block at/, `fixture starts with an unlit furnace: ${cold}`);

        await client.waitFor({ chunks_loaded: { radius: 2 } }, 30_000);
        const positionDeadline = Date.now() + 5_000;
        for (;;) {
            const feet = vec3(await client.state(), 'feet');
            if (Math.hypot(feet[0] - 0.5, feet[1] - 64, feet[2] - 0.5) < 1) break;
            assert.ok(Date.now() < positionDeadline, `client did not reach the furnace fixture: ${feet.join(', ')}`);
            await sleep(250);
        }
        await client.input({ look: { yaw: 0, pitch: 29, frames: 0 } });
        await client.input({ press: ['MouseRight'], press_frames: 3 });
        if (!(await hasScreen(client, 'Container', 3_000))) {
            log('retrying the open click after the client captured gameplay input');
            await client.input({ press: ['MouseRight'], press_frames: 3 });
        }
        await client.waitFor({ screen: { name: 'Container' } }, 15_000);
        await client.screenshot(path.join(artifacts, 'furnace-open.png'));

        await click(client, [646, 498]);
        await sleep(250);
        await click(client, [732, 317]);
        await sleep(750);
        await client.screenshot(path.join(artifacts, 'furnace-fuel-slot.png'));
        await client.input({ press: ['Escape'] });
        await client.waitForScreenAbsent('Container', 5_000);
        await sleep(750);

        const clearedCoal = server.waitForLine(/Removed \d+ items/, 10_000);
        server.command(`clear ${playerName} minecraft:coal 64`);
        const reply = await clearedCoal;
        assert.match(reply, /Removed 0 items/, `coal was moved from the player into the fuel slot: ${reply}`);

        log('moved coal from the hotbar into the furnace fuel slot');
    }
};
