/** Verifies the real client follows server teleports through every configured dimension kind. */
import assert from 'node:assert/strict';

import type { Scenario } from '../scenario.mts';
import { sleep, vec3 } from '../scenario.mts';

const dimensions = [
    { id: 'minecraft:nether', acceptedState: [1, 'minecraft:nether', 'Nether'] },
    { id: 'minecraft:overworld', acceptedState: [0, 'minecraft:overworld', 'Overworld'] },
    { id: 'minecraft:the_end', acceptedState: [2, 'minecraft:the_end', 'The End'] },
    { id: 'minecraft:overworld', acceptedState: [0, 'minecraft:overworld', 'Overworld'] },
    { id: 'client_e2e:custom', acceptedState: [1000, 'client_e2e:custom'] },
    { id: 'minecraft:overworld', acceptedState: [0, 'minecraft:overworld', 'Overworld'] }
] as const;

const platform = { from: 5, to: 11, y: 63 };
const arrivalPosition = [8, platform.y + 1, 8] as const;

export const dimensionsScenario: Scenario = {
    name: 'dimensions',
    description: 'the client changes between the Overworld, Nether, End, and a custom dimension',
    run: async ({ client, server, playerName, log }) => {
        for (const [index, destination] of dimensions.entries()) {
            const [x, y, z] = arrivalPosition;
            server.command(
                `execute in ${destination.id} run fill ${platform.from} ${platform.y} ${platform.from} ` +
                    `${platform.to} ${platform.y} ${platform.to} minecraft:stone`
            );
            const teleport = (): void =>
                server.command(`execute in ${destination.id} run teleport ${playerName} ${x} ${y} ${z}`);
            teleport();
            // A change the server is still finishing refuses the next one, so ask again until
            // the client is there.
            let nextAsk = Date.now() + 5_000;

            const deadline = Date.now() + 30_000;
            let state: Record<string, unknown>;
            for (;;) {
                state = await client.state();
                if (destination.acceptedState.some((value) => value === state.dimension)) break;
                assert.ok(
                    Date.now() < deadline,
                    `client stayed in dimension ${JSON.stringify(state.dimension)} after teleporting to ${destination.id}`
                );
                if (Date.now() >= nextAsk) {
                    log(`the change to ${destination.id} did not start, asking again`);
                    teleport();
                    nextAsk = Date.now() + 5_000;
                }
                await sleep(250);
            }

            // The loading screen first. The next teleport is refused while this change is still
            // waiting for it to close, and the chunk count is no signal: a return to a dimension
            // the client has visited still holds the columns it had, so it is met at once.
            await client.waitForScreenAbsent('Loading', 60_000);
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
