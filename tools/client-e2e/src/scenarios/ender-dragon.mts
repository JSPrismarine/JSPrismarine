/** Verifies the dragon fight opens its fountain and the client's first exit starts the credits. */
import assert from 'node:assert/strict';
import path from 'node:path';

import type { CinnabarClient } from '../client.mts';
import type { JspServer } from '../jsp-server.mts';
import type { Scenario } from '../scenario.mts';
import { sleep, vec3 } from '../scenario.mts';

const waitForDimension = async (client: CinnabarClient, expected: readonly (number | string)[]): Promise<void> => {
    const deadline = Date.now() + 30_000;
    for (;;) {
        const state = await client.state();
        if (expected.some((value) => value === state.dimension)) return;
        assert.ok(
            Date.now() < deadline,
            `client did not arrive in dimension ${expected.join(' / ')}: ${JSON.stringify(state.dimension)}`
        );
        await sleep(250);
    }
};

const waitForFountain = async (server: JspServer, timeoutMs: number): Promise<void> => {
    const deadline = Date.now() + timeoutMs;
    let probe = 0;
    while (Date.now() < deadline) {
        const marker = `CLIENT_E2E_FOUNTAIN_${probe++}`;
        const found = server.waitForLine(new RegExp(marker), 1_000);
        server.command(`execute in minecraft:the_end if block 1 3 0 minecraft:end_portal run say ${marker}`);
        try {
            await found;
            return;
        } catch {
            await sleep(250);
        }
    }
    throw new Error(`the dragon fight did not fill the exit fountain with end portal blocks within ${timeoutMs} ms`);
};

export const enderDragon: Scenario = {
    name: 'ender-dragon',
    description: 'the End fight opens its exit fountain and the first portal exit shows credits',
    run: async ({ client, server, playerName, artifacts, log }) => {
        server.command(`execute in minecraft:the_end run teleport ${playerName} 0 10 0`);
        await waitForDimension(client, [2, 'minecraft:the_end', 'The End']);
        await client.waitFor({ chunks_loaded: { radius: 2 } }, 60_000);
        await client.waitFor({ entity: { matches: 'ender_dragon', radius: 200 } }, 60_000);

        const arena = vec3(await client.state(), 'server_position');
        assert.ok(Math.hypot(arena[0], arena[2]) < 192, `client is outside the dragon arena: ${arena.join(', ')}`);
        log(`dragon is visible from ${arena.join(', ')}`);

        const killedDragon = server.waitForLine(/Killed 1 entities/, 10_000);
        server.command('execute in minecraft:the_end run kill @e[type=minecraft:ender_dragon]');
        await killedDragon;
        await waitForFountain(server, 60_000);
        await client.screenshot(path.join(artifacts, 'fountain.png'));
        log('server confirms the fountain ring contains an end portal block');

        server.command(`execute in minecraft:the_end run teleport ${playerName} 1 3 0`);
        const deadline = Date.now() + 30_000;
        for (;;) {
            const state = await client.state();
            const screens = Array.isArray(state.screens) ? state.screens : [];
            if (screens.some((screen) => typeof screen === 'string' && /credit/i.test(screen))) {
                assert.ok(
                    [2, 'minecraft:the_end', 'The End'].some((value) => value === state.dimension),
                    `client left the End before showing credits: ${JSON.stringify(state.dimension)}`
                );
                log(`client opened the credits screen: ${screens.join(', ')}`);
                await client.input({ press: ['Escape'] });
                await client.waitForScreenAbsent('Credits');
                await client.waitForScreenAbsent('Loading');
                await waitForDimension(client, [0, 'minecraft:overworld', 'Overworld']);
                await client.waitFor({ chunks_loaded: { radius: 2 } }, 60_000);
                return;
            }
            assert.ok(Date.now() < deadline, `client did not show credits; screens: ${JSON.stringify(screens)}`);
            await sleep(250);
        }
    }
};
