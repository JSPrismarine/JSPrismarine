/** Verifies server authority reaches the client: a console teleport must move the rendered player. */
import assert from 'node:assert/strict';

import type { Scenario } from '../scenario.mts';
import { sleep, vec3 } from '../scenario.mts';

export const teleport: Scenario = {
    name: 'teleport',
    description: 'a server console teleport moves the client player to the target',
    run: async ({ client, server, playerName, log }) => {
        const before = vec3(await client.state(), 'feet');
        const target: [number, number] = [Math.round(before[0]) + 24, Math.round(before[2]) + 24];
        server.command(`teleport ${playerName} ${target[0]} -56 ${target[1]}`);

        const deadline = Date.now() + 30_000;
        for (;;) {
            const feet = vec3(await client.state(), 'feet');
            const distance = Math.hypot(feet[0] - target[0], feet[2] - target[1]);
            if (distance < 2) {
                log(`teleported from ${before.join(', ')} to ${feet.join(', ')}`);
                return;
            }
            assert.ok(
                Date.now() < deadline,
                `client never arrived at ${target.join(', ')}; still at ${feet.join(', ')}`
            );
            await sleep(500);
        }
    }
};
