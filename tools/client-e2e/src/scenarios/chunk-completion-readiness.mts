/** Verifies a client receives nearby chunks after repeated loading bursts. */
import assert from 'node:assert/strict';

import type { Scenario } from '../scenario.mts';
import { sleep, vec3 } from '../scenario.mts';

export const chunkCompletionReadiness: Scenario = {
    name: 'chunk-completion-readiness',
    description: 'nearby chunks become visible after repeated teleports through background completion work',
    serverOptions: { profile: true },
    run: async ({ client, server, playerName, log }) => {
        await client.waitFor({ chunks_loaded: { radius: 2 } }, 60_000);
        server.command(`gamemode creative ${playerName}`);

        const destinations: readonly (readonly [number, number])[] = [
            [24, 24],
            [-40, 40]
        ];
        for (const [index, [x, z]] of destinations.entries()) {
            const floorReady = server.waitForLine(new RegExp(`chunk-readiness-floor-${index}`), 15_000);
            server.command(`fill ${x - 1} -57 ${z - 1} ${x + 1} -57 ${z + 1} minecraft:stone`);
            server.command(`say chunk-readiness-floor-${index}`);
            await floorReady;
            server.command(`teleport ${playerName} ${x} -56 ${z}`);

            const deadline = Date.now() + 30_000;
            for (;;) {
                const feet = vec3(await client.state(), 'feet');
                if (Math.hypot(feet[0] - x, feet[1] + 56, feet[2] - z) < 2) break;
                assert.ok(
                    Date.now() < deadline,
                    `client did not reach chunk burst ${index + 1}; at ${feet.join(', ')}`
                );
                await sleep(250);
            }

            await client.waitFor({ chunks_loaded: { radius: 4 } }, 60_000);
            const state = await client.state();
            const chunks = state.chunks;
            assert.ok(typeof chunks === 'object' && chunks !== null, 'client reports chunk readiness state');
            const loaded = 'loaded_columns' in chunks ? chunks.loaded_columns : undefined;
            assert.ok(typeof loaded === 'number' && loaded > 0, `loaded chunk columns (${String(loaded)}) > 0`);
            log(`${index + 1}/2: client received nearby chunks at ${x}, ${z} (${loaded} loaded columns)`);
        }

        await sleep(5_000);
        log('steady-state window complete after 5 seconds with the client stationary');
    }
};
