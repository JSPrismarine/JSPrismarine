/** Verifies that a player who leaves and logs back in comes back from their saved record. */
import assert from 'node:assert/strict';

import type { CinnabarClient } from '../client.mts';
import type { JspServer } from '../jsp-server.mts';
import type { Scenario } from '../scenario.mts';
import { sleep, untilTicks, vec3 } from '../scenario.mts';

/** The name both visits log in with, so the second finds the record the first left. */
const RETURNING = 'jsp-e2e-rejoin';

/** Where the first visit leaves from: the Nether's flat floor tops out at y 3. */
const SPOT = { x: 8, y: 4, z: 8 };

const NETHER_STATES: readonly unknown[] = [1, 'minecraft:nether', 'Nether'];

/** How many players the server counts as online, from the `list` command. */
const onlineCount = async (server: JspServer): Promise<number> => {
    const reply = server.waitForLine(/There are \d+ players online/, 10_000);
    server.command('list');
    return Number(/There are (\d+) players online/.exec(await reply)?.[1]);
};

/** The health the client shows, as its current and maximum. */
const healthOf = (state: Record<string, unknown>): { current: number; maximum: number } => {
    const health = state.health as { current?: unknown; maximum?: unknown } | undefined;
    assert.ok(
        typeof health?.current === 'number' && typeof health.maximum === 'number',
        `state.health is not a pair of numbers: ${JSON.stringify(state.health)}`
    );
    return { current: health.current, maximum: health.maximum };
};

/** Waits until the client is in the Nether with its loading screen closed and chunks around it. */
const settleInNether = async (client: CinnabarClient): Promise<Record<string, unknown>> => {
    const deadline = Date.now() + 60_000;
    for (;;) {
        const state = await client.state();
        if (NETHER_STATES.includes(state.dimension)) break;
        assert.ok(Date.now() < deadline, `client stayed in dimension ${JSON.stringify(state.dimension)}`);
        await sleep(250);
    }
    await client.waitForScreenAbsent('Loading', 60_000);
    await client.waitFor({ chunks_loaded: { radius: 2 } }, 60_000);
    return client.state();
};

export const rejoin: Scenario = {
    name: 'rejoin',
    description: 'a player who leaves hurt in the Nether logs back in there, as hurt as they left',
    run: async ({ server, createClient, log }) => {
        // Health that regenerated between the save and the return would hide a record that lost it.
        server.command('gamerule naturalRegeneration false');
        try {
            const first = await createClient(RETURNING);
            server.command(`execute in minecraft:nether run teleport ${RETURNING} ${SPOT.x} ${SPOT.y} ${SPOT.z}`);
            await settleInNether(first);

            server.command(`damage ${RETURNING} 7`);
            const deadline = Date.now() + 15_000;
            let left: Record<string, unknown>;
            for (;;) {
                left = await first.state();
                if (healthOf(left).current < healthOf(left).maximum) break;
                assert.ok(Date.now() < deadline, 'the player never took the damage');
                await sleep(250);
            }
            const leftAt = vec3(left, 'server_position');
            const leftHealth = healthOf(left).current;
            log(`left the Nether at ${leftAt.join(', ')} on ${leftHealth} health`);

            const online = await onlineCount(server);
            await first.close();
            const gone = await untilTicks(server, 600, async () => (await onlineCount(server)) < online);
            assert.ok(gone, `the server still counts ${online} players after ${RETURNING} left`);

            const second = await createClient(RETURNING);
            const back = await settleInNether(second);
            const backAt = vec3(back, 'server_position');
            assert.ok(
                Math.hypot(backAt[0] - leftAt[0], backAt[1] - leftAt[1], backAt[2] - leftAt[2]) < 1,
                `came back at ${backAt.join(', ')}, having left at ${leftAt.join(', ')}`
            );
            assert.equal(healthOf(back).current, leftHealth, 'came back on other health than they left on');
            log(`came back in the Nether at ${backAt.join(', ')} on ${healthOf(back).current} health`);
            await second.close();
        } finally {
            server.command('gamerule naturalRegeneration true');
        }
    }
};
