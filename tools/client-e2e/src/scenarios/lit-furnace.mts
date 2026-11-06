/** Verifies a furnace that lit itself by cooking still opens, drops, and shows its fire. */
import assert from 'node:assert/strict';
import path from 'node:path';

import { sleep, waitTicks, standAt } from '../scenario.mts';
import type { Scenario } from '../scenario.mts';

const BLOCK_REPLY = /Found the block at|The block is |That chunk is not loaded/;

/** Asks the server what stands at the fixture position. */
const blockReply = async (server: Parameters<Scenario['run']>[0]['server'], identifier: string): Promise<string> => {
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

export const litFurnace: Scenario = {
    name: 'lit-furnace',
    description: 'a furnace lit by its own cooking still opens and drops when mined',
    run: async (context) => {
        const { client, server, playerName, artifacts, log } = context;
        server.command('fill -2 63 -2 2 63 4 minecraft:stone');
        // Facing the player, so the lit front and its fire are what the screenshot shows.
        server.command('setblock 0 64 2 minecraft:furnace ["minecraft:cardinal_direction"="north"]');
        // Input and fuel together are what light it: the cooking tick takes over from there.
        server.command('replaceitem block 0 64 2 slot.container 0 minecraft:iron_ore 8');
        server.command('replaceitem block 0 64 2 slot.container 1 minecraft:coal 8');
        server.command(`replaceitem entity ${playerName} slot.hotbar 0 minecraft:diamond_pickaxe 1`);
        await standAt(context, { x: 0.5, y: 64, z: 0.5 });

        const litDeadline = Date.now() + 30_000;
        for (;;) {
            const reply = await blockReply(server, 'lit_furnace');
            if (/Found the block at/.test(reply)) break;
            assert.ok(Date.now() < litDeadline, `the furnace never lit itself: ${reply}`);
            await waitTicks(server, 10);
        }

        await client.waitFor({ chunks_loaded: { radius: 2 } }, 30_000);
        // The fire and smoke are the client's own, drawn for the block it believes is there,
        // so the screenshot is the particle evidence and the screen is the inventory check.
        await client.input({ look: { yaw: 0, pitch: 29, frames: 0 } });
        await waitTicks(server, 10);
        await client.screenshot(path.join(artifacts, 'lit-furnace.png'));

        await client.input({ press: ['MouseRight'], press_frames: 3 });
        if (!(await hasScreen(client, 'Container', 3_000))) {
            log('retrying the open click after the client captured gameplay input');
            await client.input({ press: ['MouseRight'], press_frames: 3 });
        }
        assert.ok(await hasScreen(client, 'Container', 15_000), 'the lit furnace never opened its screen');
        await client.screenshot(path.join(artifacts, 'lit-furnace-open.png'));

        // Two frames a few seconds apart: the arrow and the flame are drawn from the cook and
        // burn properties, so a screen that is never told them renders the same pixels twice.
        await waitTicks(server, 60);
        await client.screenshot(path.join(artifacts, 'lit-furnace-progress.png'));

        // The screen showing what the block holds is the inventory check: pick the ore out of
        // the input slot and drop it on the hotbar, then ask the server whether it arrived.
        await client.clickAt([732, 241]);
        await sleep(250);
        await client.clickAt([688, 498]);
        await waitTicks(server, 15);
        await client.input({ press: ['Escape'] });
        await client.waitForScreenAbsent('Container', 5_000);
        await waitTicks(server, 10);

        // A clean floor, so the drop the mining produces is the only item standing.
        const cleared = server.waitForLine(/Killed \d+ entities/, 10_000);
        server.command('kill @e[type=item]');
        await cleared;

        await client.input({ look: { yaw: 0, pitch: 29, frames: 0 } });
        await client.input({ hold: ['key.attack'] });
        const brokeBy = Date.now() + 15_000;
        let gone = await blockReply(server, 'air');
        while (!/Found the block at/.test(gone) && Date.now() < brokeBy) {
            await sleep(250);
            gone = await blockReply(server, 'air');
        }
        await client.input({ release_all: true });

        assert.match(gone, /Found the block at/, `the lit furnace was mined away: ${gone}`);

        // The furnace item itself, not the ore and coal that spill out of any broken
        // container: standing on the break site puts the drops in the hotbar, and clear
        // counts them.
        server.command(`teleport ${playerName} 0.5 64 2.5`);
        // The drop is picked up some ticks after the player stands on it, so ask until it is in.
        const pickupBy = Date.now() + 15_000;
        let furnaceDrop: string;
        for (;;) {
            await waitTicks(server, 10);
            const pickedUp = server.waitForLine(/Removed \d+ items|Could not/, 10_000);
            server.command(`clear ${playerName} minecraft:furnace 64`);
            furnaceDrop = await pickedUp;
            if (/Removed [1-9]/.test(furnaceDrop) || Date.now() > pickupBy) break;
        }
        assert.match(furnaceDrop, /Removed [1-9]/, `mining the lit furnace dropped a furnace: ${furnaceDrop}`);

        const movedOre = server.waitForLine(/Removed \d+ items|Could not/, 10_000);
        server.command(`clear ${playerName} minecraft:iron_ore 64`);
        const oreMoved = await movedOre;
        assert.match(
            oreMoved,
            /Removed [1-9]/,
            `the ore clicked out of the open screen reached the player: ${oreMoved}`
        );

        log('the lit furnace opened a screen with its items, its progress, and dropped a furnace');
    }
};
