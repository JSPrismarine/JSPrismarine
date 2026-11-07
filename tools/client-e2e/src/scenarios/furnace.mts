/** Verifies a real Bedrock client can move coal from its hotbar into a furnace's fuel slot. */
import assert from 'node:assert/strict';
import path from 'node:path';

import { sleep, waitTicks, standAt } from '../scenario.mts';
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

export const furnace: Scenario = {
    name: 'furnace',
    description: 'a client can put coal in the furnace fuel slot and take the ore out of its input',
    run: async (context) => {
        const { client, server, playerName, artifacts, log } = context;
        server.command('fill -2 63 -2 2 63 4 minecraft:stone');
        server.command('setblock 0 64 2 minecraft:furnace');
        server.command('replaceitem block 0 64 2 slot.container 0 minecraft:iron_ore 1');
        server.command(`replaceitem entity ${playerName} slot.hotbar 0 minecraft:coal 1`);
        const ready = server.waitForLine(/furnace-fixture-ready/, 30_000);
        server.command('say furnace-fixture-ready');
        await ready;

        const cold = await furnaceReply(server, 'furnace');
        assert.match(cold, /Found the block at/, `fixture starts with an unlit furnace: ${cold}`);

        await client.waitFor({ chunks_loaded: { radius: 2 } }, 30_000);
        await standAt(context, { x: 0.5, y: 64, z: 0.5 });
        await client.input({ look: { yaw: 0, pitch: 29, frames: 0 } });
        await client.input({ press: ['MouseRight'], press_frames: 3 });
        if (!(await hasScreen(client, 'Container', 3_000))) {
            log('retrying the open click after the client captured gameplay input');
            await client.input({ press: ['MouseRight'], press_frames: 3 });
        }
        await client.waitFor({ screen: { name: 'Container' } }, 15_000);
        await client.screenshot(path.join(artifacts, 'furnace-open.png'));

        await client.clickAt([646, 498]);
        await sleep(250);
        await client.clickAt([732, 317]);
        await waitTicks(server, 15);
        await client.screenshot(path.join(artifacts, 'furnace-fuel-slot.png'));

        // And back out: the ore in the input slot, picked up and dropped on the hotbar. The
        // server has to have told the client an id for it, or the click never becomes a request.
        await client.clickAt([732, 241]);
        await client.waitFrames(15);
        await client.clickAt([688, 498]);
        await waitTicks(server, 15);
        const countedOre = server.waitForLine(/Found \d+ matching/, 10_000);
        server.command(`clear ${playerName} minecraft:iron_ore 0`);
        assert.match(await countedOre, /Found [1-9]/, 'the ore taken out of the furnace input reached the player');
        await client.input({ press: ['Escape'] });
        await client.waitForScreenAbsent('Container', 5_000);
        await waitTicks(server, 15);

        const clearedCoal = server.waitForLine(/Removed \d+ items/, 10_000);
        server.command(`clear ${playerName} minecraft:coal 64`);
        const reply = await clearedCoal;
        assert.match(reply, /Removed 0 items/, `coal was moved from the player into the fuel slot: ${reply}`);

        log('moved coal from the hotbar into the furnace fuel slot');
    }
};
