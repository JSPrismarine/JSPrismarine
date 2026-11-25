/**
 * Verifies a player goes through a nether portal into the Nether and an end portal into the End,
 * and lands where the trip resolves: in the Nether's arrival portal and on the End platform.
 *
 * A trip whose destination is still being prepared sends the dimension change ahead of the
 * arrival, so the client waits on its loading screen while the server finds or builds the exit,
 * and only then gets its columns and the teleport to where it really lands.
 */
import assert from 'node:assert/strict';

import type { CinnabarClient } from '../client.mts';
import type { Scenario } from '../scenario.mts';
import { gameTime, healthOf, sleep, vec3, waitTicks } from '../scenario.mts';

/**
 * The Overworld pad everything stands on. The e2e Overworld is not one of the y 3 flat floors the
 * other dimensions use, so the scenario brings its own ground, as the dimensions scenario does.
 */
const PAD = { from: { x: 16, z: 16 }, to: { x: 36, z: 28 }, y: 63 } as const;

/** The nether portal's frame, four wide along x and five tall, standing on the pad. */
const FRAME = { x: 20, z: 20 } as const;

/** The end portal block, set into the pad. */
const END_PORTAL = { x: 32, z: 24 } as const;

const NETHER = [1, 'minecraft:nether', 'Nether'] as const;
const OVERWORLD = [0, 'minecraft:overworld', 'Overworld'] as const;
const THE_END = [2, 'minecraft:the_end', 'The End'] as const;

/** Where a player lands in the End: Java's `END_SPAWN_POINT` (100, 50, 0) with a player one lower. */
const END_ARRIVAL = [100.5, 49, 0.5] as const;

const waitForDimension = async (
    client: CinnabarClient,
    expected: readonly (number | string)[],
    what: string
): Promise<void> => {
    const deadline = Date.now() + 60_000;
    for (;;) {
        const state = await client.state();
        if (expected.some((value) => value === state.dimension)) return;
        assert.ok(Date.now() < deadline, `${what}: the client stayed in ${JSON.stringify(state.dimension)}`);
        await sleep(250);
    }
};

export const portals: Scenario = {
    name: 'portals',
    description: 'a player goes through a nether portal into the Nether and an end portal onto the End platform',
    run: async (context) => {
        const { client, server, playerName, log } = context;
        const floor = PAD.y + 1;

        server.command(`fill ${PAD.from.x} ${PAD.y} ${PAD.from.z} ${PAD.to.x} ${PAD.y} ${PAD.to.z} stone`);
        server.command(`fill ${FRAME.x} ${floor} ${FRAME.z} ${FRAME.x + 3} ${floor + 4} ${FRAME.z} obsidian`);
        server.command(
            `fill ${FRAME.x + 1} ${floor + 1} ${FRAME.z} ${FRAME.x + 2} ${floor + 3} ${FRAME.z} minecraft:portal`
        );
        server.command(`teleport ${playerName} ${FRAME.x + 1.5} ${floor} ${FRAME.z + 3.5}`);
        await waitTicks(server, 20);
        const before = healthOf(await client.state()).current;

        // Into the interior, on the frame's bottom row. A survival player waits 80 ticks.
        const start = await gameTime(server);
        server.command(`teleport ${playerName} ${FRAME.x + 1.5} ${floor + 1} ${FRAME.z + 0.5}`);
        await waitForDimension(client, NETHER, 'nether portal');
        log(`entered the Nether ${(await gameTime(server)) - start} ticks after stepping in`);
        await client.waitForScreenAbsent('Loading', 60_000);
        await client.waitFor({ chunks_loaded: { radius: 2 } }, 60_000);
        await waitTicks(server, 20);

        // The trip lands the player in the portal it built: (20, 20) / 8 is (2.5, 2.5).
        const nether = vec3(await client.state(), 'server_position');
        log(`landed in the Nether at ${nether.join(', ')}`);
        assert.ok(
            Math.hypot(nether[0] - 2.5, nether[2] - 2.5) < 3,
            `the Nether arrival ${nether.join(', ')} is not at the scaled portal`
        );
        const arrived = await client.state();
        assert.ok(
            healthOf(arrived).current >= before,
            `the player was hurt arriving in the Nether: ${JSON.stringify(arrived.health)}`
        );

        server.command(
            `execute in minecraft:overworld run teleport ${playerName} ${FRAME.x + 1.5} ${floor} ${FRAME.z + 6.5}`
        );
        await waitForDimension(client, OVERWORLD, 'back to the Overworld');
        await client.waitForScreenAbsent('Loading', 60_000);
        await client.waitFor({ chunks_loaded: { radius: 2 } }, 60_000);
        await waitTicks(server, 20);

        server.command(`setblock ${END_PORTAL.x} ${PAD.y} ${END_PORTAL.z} minecraft:end_portal`);
        await waitTicks(server, 5);
        const endStart = await gameTime(server);
        server.command(`teleport ${playerName} ${END_PORTAL.x + 0.5} ${floor} ${END_PORTAL.z + 0.5}`);
        await waitForDimension(client, THE_END, 'end portal');
        log(`entered the End ${(await gameTime(server)) - endStart} ticks after stepping in`);
        await client.waitForScreenAbsent('Loading', 60_000);
        await client.waitFor({ chunks_loaded: { radius: 2 } }, 60_000);
        await waitTicks(server, 20);

        const end = vec3(await client.state(), 'feet');
        log(`landed in the End at ${end.join(', ')}`);
        assert.ok(
            Math.hypot(end[0] - END_ARRIVAL[0], end[2] - END_ARRIVAL[2]) < 1 && Math.abs(end[1] - END_ARRIVAL[1]) < 1,
            `the End arrival ${end.join(', ')} is not on the platform at ${END_ARRIVAL.join(', ')}`
        );
    }
};
