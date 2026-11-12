/** Verifies liquid scooping charges the authoritative empty container. */
import assert from 'node:assert/strict';

import { lookTo, sleep, standAt, waitTicks } from '../scenario.mts';
import type { Scenario, ScenarioContext } from '../scenario.mts';

/** Fills one `container` from a `liquid` source in front of the player and checks one was spent. */
const scoop = async (
    { client, server, playerName, log }: ScenarioContext,
    liquid: string,
    container: string
): Promise<void> => {
    server.command(`setblock 32 63 0 minecraft:stone`);
    server.command(`setblock 32 63 2 minecraft:stone`);
    server.command(`setblock 32 64 2 minecraft:${liquid}`);
    server.command(`replaceitem entity ${playerName} slot.hotbar 0 minecraft:${container} 2`);
    await standAt({ client, server, playerName }, { x: 32.5, y: 64, z: 0.5 });
    await client.input({ hotbar: 1 });
    await lookTo(client, 0, 30);
    await sleep(500);
    await client.input({ press: ['MouseRight'], press_frames: 1 });
    await sleep(100);
    await client.input({ release: ['MouseRight'] });
    await waitTicks(server, 10);
    const counted = server.waitForLine(/Found \d+ matching/, 10_000);
    server.command(`clear ${playerName} minecraft:${container} 0`);
    assert.match(await counted, /Found 1 matching/, `${liquid} scoop must spend one ${container}`);
    log(`${liquid} scoop spent one ${container}`);
    server.command(`clear ${playerName}`);
    server.command('setblock 32 64 2 minecraft:air');
};

export const liquidContainers: Scenario = {
    name: 'liquid-containers',
    description: 'filling buckets with water and lava spends one empty bucket in survival',
    run: async (context) => {
        await context.client.waitFor({ chunks_loaded: { radius: 2 } }, 30_000);
        await scoop(context, 'water', 'bucket');
        await scoop(context, 'lava', 'bucket');
    }
};

// Its own scenario rather than a third round of liquid-containers, so a client pin that cannot aim
// a bottle at water can skip it without losing the bucket checks.
export const glassBottleFilling: Scenario = {
    name: 'glass-bottle-filling',
    description: 'filling a glass bottle from a water source spends one empty bottle in survival',
    run: async (context) => {
        await context.client.waitFor({ chunks_loaded: { radius: 2 } }, 30_000);
        await scoop(context, 'water', 'glass_bottle');
    }
};
