/** Verifies the real client follows server teleports through every configured dimension kind. */
import assert from 'node:assert/strict';

import type { Scenario } from '../scenario.mts';
import { sleep, vec3 } from '../scenario.mts';

const dimensions = [
    { id: 'minecraft:nether', acceptedState: [1, 'minecraft:nether', 'Nether'], position: [8, 10, 8] },
    { id: 'minecraft:overworld', acceptedState: [0, 'minecraft:overworld', 'Overworld'], position: [0, 5, 0] },
    { id: 'minecraft:the_end', acceptedState: [2, 'minecraft:the_end', 'The End'], position: [8, 10, 8] },
    { id: 'minecraft:overworld', acceptedState: [0, 'minecraft:overworld', 'Overworld'], position: [0, 5, 0] },
    { id: 'client_e2e:custom', acceptedState: [1000, 'client_e2e:custom'], position: [8, 80, 8] },
    { id: 'minecraft:overworld', acceptedState: [0, 'minecraft:overworld', 'Overworld'], position: [0, 5, 0] }
] as const;

export const dimensionsScenario: Scenario = {
    name: 'dimensions',
    description: 'the client changes between the Overworld, Nether, End, and a custom dimension',
    run: async ({ client, server, playerName, log }) => {
        for (const [index, destination] of dimensions.entries()) {
            const [x, y, z] = destination.position;
            server.command(`execute in ${destination.id} run teleport ${playerName} ${x} ${y} ${z}`);

            const deadline = Date.now() + 30_000;
            let state: Record<string, unknown>;
            for (;;) {
                state = await client.state();
                if (destination.acceptedState.some((value) => value === state.dimension)) break;
                assert.ok(
                    Date.now() < deadline,
                    `client stayed in dimension ${JSON.stringify(state.dimension)} after teleporting to ${destination.id}`
                );
                await sleep(250);
            }

            await client.waitFor({ chunks_loaded: { radius: 2 } }, 60_000);
            state = await client.state();
            const position = vec3(state, 'server_position');
            assert.ok(
                Math.hypot(position[0] - x, position[2] - z) < 3,
                `client arrived in ${destination.id} at ${position.join(', ')}, expected near ${x}, ${y}, ${z}`
            );
            log(`${index + 1}/${dimensions.length}: client entered ${destination.id} at ${position.join(', ')}`);
        }
    }
};
