/** Verifies the real client follows server teleports through every configured dimension kind. */
import assert from 'node:assert/strict';

import type { Scenario } from '../scenario.mts';
import { healthOf, sleep, vec3, waitTicks } from '../scenario.mts';

/**
 * Where each change lands. The Overworld is the one dimension whose chunks are loaded when the
 * command runs, so it gets a stone pad; every other dimension is a flat world whose floor tops out
 * at y 3, and the arrival stands on it. A fill into a dimension nobody is in finds no loaded chunk
 * and places nothing, as Java's "That position is not loaded" does; the pad this scenario used to
 * fill there landed in the Overworld instead, and the player fell sixty blocks onto the Nether
 * floor and died on about half the runs.
 */
const OVERWORLD_PAD = { from: 5, to: 11, y: 63 };
const FLAT_FLOOR_Y = 3;

const dimensions = [
    { id: 'minecraft:nether', acceptedState: [1, 'minecraft:nether', 'Nether'], pad: false },
    { id: 'minecraft:overworld', acceptedState: [0, 'minecraft:overworld', 'Overworld'], pad: true },
    { id: 'minecraft:the_end', acceptedState: [2, 'minecraft:the_end', 'The End'], pad: false },
    { id: 'minecraft:overworld', acceptedState: [0, 'minecraft:overworld', 'Overworld'], pad: true },
    { id: 'client_e2e:custom', acceptedState: [1000, 'client_e2e:custom'], pad: false },
    { id: 'minecraft:overworld', acceptedState: [0, 'minecraft:overworld', 'Overworld'], pad: true }
] as const;

export const dimensionsScenario: Scenario = {
    name: 'dimensions',
    description: 'the client changes between the Overworld, Nether, End, and a custom dimension',
    run: async ({ client, server, playerName, log }) => {
        for (const [index, destination] of dimensions.entries()) {
            const [x, z] = [8, 8];
            const y = (destination.pad ? OVERWORLD_PAD.y : FLAT_FLOOR_Y) + 1;
            if (destination.pad) {
                server.command(
                    `execute in ${destination.id} run fill ${OVERWORLD_PAD.from} ${OVERWORLD_PAD.y} ${OVERWORLD_PAD.from} ` +
                        `${OVERWORLD_PAD.to} ${OVERWORLD_PAD.y} ${OVERWORLD_PAD.to} minecraft:stone`
                );
            }
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

            // Landing must not hurt. A player who fell to the floor of a dimension whose ground
            // was missing dies a moment later, and the client then never reports the next
            // change's loading screen, which is how this used to fail three steps further on.
            const health = healthOf(state);
            assert.equal(
                health.current,
                health.maximum,
                `the player was hurt arriving in ${destination.id}: ${JSON.stringify(health)}`
            );

            // Let the client finish with this arrival before the next one is asked for. A change
            // that follows the close of the last loading screen within a second has left the
            // protocol 2193 client sitting on its next loading screen for ever in CI, where the
            // server's log shows it open the screen and never close it.
            await waitTicks(server, 40);
        }
    }
};
