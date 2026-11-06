/** Verifies a shift-clicked recipe-book entry crafts its output into the inventory. */
import assert from 'node:assert/strict';
import path from 'node:path';

import { sleep, vec3, waitTicks } from '../scenario.mts';
import type { Scenario } from '../scenario.mts';

/** Waits for a screen without racing the first click that captures gameplay input. */
const hasScreen = async (client: Parameters<Scenario['run']>[0]['client'], name: string): Promise<boolean> => {
    const deadline = Date.now() + 3_000;
    do {
        const screens = (await client.state()).screens;
        if (Array.isArray(screens) && screens.includes(name)) return true;
        await sleep(250);
    } while (Date.now() < deadline);
    return false;
};

export const recipeBook: Scenario = {
    name: 'recipe-book',
    description: 'shift-clicks the oak planks recipe-book entry and crafts all available planks',
    run: async ({ client, server, playerName, artifacts, log }) => {
        server.command('fill -2 63 -2 2 63 4 minecraft:stone');
        server.command('setblock 0 64 2 minecraft:crafting_table');
        server.command(`replaceitem entity ${playerName} slot.hotbar 0 minecraft:oak_log 2`);
        server.command(`teleport ${playerName} 0.5 64 0.5`);

        const ready = server.waitForLine(/recipe-book-fixture-ready/, 30_000);
        server.command(`recipe give ${playerName} crafting_table/minecraft:oak_planks`);
        server.command('say recipe-book-fixture-ready');
        await ready;

        await client.waitFor({ chunks_loaded: { radius: 2 } }, 30_000);
        const deadline = Date.now() + 5_000;
        for (;;) {
            const feet = vec3(await client.state(), 'feet');
            if (Math.hypot(feet[0] - 0.5, feet[1] - 64, feet[2] - 0.5) < 1) break;
            if (Date.now() > deadline) throw new Error(`client did not reach the crafting table: ${feet.join(', ')}`);
            await sleep(250);
        }

        await client.input({ look: { yaw: 0, pitch: 29, frames: 0 } });
        await client.input({ press: ['MouseRight'], press_frames: 3 });
        if (!(await hasScreen(client, 'Container'))) {
            log('retrying the table open click after the client captured gameplay input');
            await client.input({ press: ['MouseRight'], press_frames: 3 });
        }
        await client.waitFor({ screen: { name: 'Container' } }, 15_000);
        await client.screenshot(path.join(artifacts, 'crafting-table-open.png'));
        await client.clickAt([430, 248]);
        await client.input({ text: 'Oak Planks' });
        await waitTicks(server, 10);
        await client.screenshot(path.join(artifacts, 'crafting-recipe-filtered.png'));
        await client.clickAt([387, 287], { hold: ['ShiftLeft'] });
        await waitTicks(server, 20);
        await client.screenshot(path.join(artifacts, 'crafting-table-shift-click.png'));
        await client.input({ press: ['Escape'] });
        await client.waitForScreenAbsent('Container', 5_000);
        await waitTicks(server, 15);

        const clearedTables = server.waitForLine(/Removed \d+ items/, 10_000);
        server.command(`clear ${playerName} minecraft:oak_planks 64`);
        const tableReply = await clearedTables;
        assert.match(tableReply, /Removed 8 items/, `shift-click crafted eight planks from two logs: ${tableReply}`);

        const clearedLogs = server.waitForLine(/Removed \d+ items/, 10_000);
        server.command(`clear ${playerName} minecraft:oak_log 64`);
        const logReply = await clearedLogs;
        assert.match(logReply, /Removed 0 items/, `shift-click consumed both logs: ${logReply}`);
        log('shift-clicked the oak planks recipe in the recipe book');
    }
};
