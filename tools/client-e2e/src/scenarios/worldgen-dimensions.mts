/** Verifies the client receives the noise-generated terrain of the Nether and the End. */
import type { Scenario } from '../scenario.mts';
import { changeDimension, vec3 } from '../scenario.mts';

/**
 * Below the Nether's bedrock roof and above the End's main island. The player is a spectator, so
 * neither the netherrack it may land in nor a fall can hurt it.
 */
const ARRIVAL = { x: 8.5, y: 100, z: 8.5 } as const;

const destinations = [
    { id: 'minecraft:the_nether', acceptedState: [1, 'minecraft:the_nether', 'Nether'] },
    { id: 'minecraft:the_end', acceptedState: [2, 'minecraft:the_end', 'The End'] }
] as const;

export const worldgenDimensions: Scenario = {
    name: 'worldgen-dimensions',
    description: 'the client receives the Nether and End terrain the Java noise generator builds',
    serverOptions: { worldgenSpawn: true },
    run: async (context) => {
        const { server, client, playerName, log } = context;
        server.command(`gamemode spectator ${playerName}`);

        for (const destination of destinations) {
            await changeDimension(context, destination.id, destination.acceptedState, ARRIVAL);
            // A chunk that fails to generate never reaches the client, which then waits here,
            // and the harness fails any scenario whose server logged a chunk it could not load.
            await client.waitForScreenAbsent('Loading', 300_000);
            await client.waitFor({ chunks_loaded: { radius: 2 } }, 300_000);
            const position = vec3(await client.state(), 'server_position');
            log(`the client loaded the terrain around ${position.join(', ')} in ${destination.id}`);
        }
    }
};
