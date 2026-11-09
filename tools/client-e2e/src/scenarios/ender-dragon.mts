/** Verifies the dragon fight opens its fountain and the client's first exit starts the credits. */
import assert from 'node:assert/strict';
import path from 'node:path';

import type { CinnabarClient } from '../client.mts';
import type { JspServer } from '../jsp-server.mts';
import type { Scenario } from '../scenario.mts';
import { gameTime, sleep, vec3, waitTicks } from '../scenario.mts';

/**
 * The flat End's floor is end stone up to y 3, so the fight stands its podium there, on top of
 * the (0, 0) column, and fills the ring at that height.
 */
const FOUNTAIN = { x: 1, y: 3, z: 0 } as const;

/** Where the player waits: on the floor, clear of the podium's seven-block footprint. */
const ARRIVAL = { x: 0.5, y: 4, z: 8.5 } as const;

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

/** Whether the exit portal's ring holds an end portal block, as the server sees it. */
const fountainOpen = async (server: JspServer, probe: number): Promise<boolean> => {
    const marker = `CLIENT_E2E_FOUNTAIN_${probe}`;
    const found = server.waitForLine(new RegExp(marker), 5_000);
    server.command(
        `execute in minecraft:the_end if block ${FOUNTAIN.x} ${FOUNTAIN.y} ${FOUNTAIN.z} minecraft:end_portal run say ${marker}`
    );
    return found.then(
        () => true,
        () => false
    );
};

/**
 * Waits for the fountain, counting the world's ticks rather than seconds.
 *
 * The fight fills it when the dragon's death animation ends, a fixed number of ticks after the
 * kill. A host that falls behind runs fewer ticks a second, and a wall-clock budget ran out
 * there before the animation did.
 */
const waitForFountain = async (server: JspServer, withinTicks: number): Promise<void> => {
    const start = await gameTime(server);
    for (let probe = 0; ; probe += 1) {
        if (await fountainOpen(server, probe)) return;
        const ran = (await gameTime(server)) - start;
        if (ran >= withinTicks) {
            throw new Error(`the dragon fight did not fill the exit fountain within ${ran} ticks of the kill`);
        }
        await waitTicks(server, 10);
    }
};

export const enderDragon: Scenario = {
    name: 'ender-dragon',
    description: 'the End fight opens its exit fountain and the first portal exit shows credits',
    run: async ({ client, server, playerName, artifacts, log }) => {
        // Nothing changes the End's floor before the fight first looks at it, so the podium goes
        // on the same block every run. The player waits beside it rather than on the spot it will
        // take.
        server.command(
            `execute in minecraft:the_end run teleport ${playerName} ${ARRIVAL.x} ${ARRIVAL.y} ${ARRIVAL.z}`
        );
        await waitForDimension(client, [2, 'minecraft:the_end', 'The End']);
        await client.waitFor({ chunks_loaded: { radius: 2 } }, 60_000);
        await client.waitFor({ entity: { matches: 'ender_dragon', radius: 200 } }, 60_000);

        const arena = vec3(await client.state(), 'server_position');
        assert.ok(Math.hypot(arena[0], arena[2]) < 192, `client is outside the dragon arena: ${arena.join(', ')}`);
        log(`dragon is visible from ${arena.join(', ')}`);

        const killedDragon = server.waitForLine(/Killed 1 entities/, 10_000);
        server.command('execute in minecraft:the_end run kill @e[type=minecraft:ender_dragon]');
        await killedDragon;
        // Twice Java's 200-tick death animation, which the fight waits out before it fills the ring.
        await waitForFountain(server, 400);
        await client.screenshot(path.join(artifacts, 'fountain.png'));
        log('server confirms the fountain ring contains an end portal block');

        server.command(
            `execute in minecraft:the_end run teleport ${playerName} ${FOUNTAIN.x} ${FOUNTAIN.y} ${FOUNTAIN.z}`
        );
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
