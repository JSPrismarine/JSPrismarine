/**
 * A Java client joins: it logs in, is configured with vanilla's registries and tags, loads the
 * world around spawn, and is a player in it, which the console's `list` counts. Everyone is told
 * it joined, as a Bedrock player's join is told, and the client shows that too.
 */
import type { JavaScenario } from '../java-run.mts';
import { joinWorld } from './support.mts';

/** How long the client must stay in the world with nothing ending its connection: past two keep-alives and the client's own 30-second timeout. */
const STAY_MS = 40_000;

export const join: JavaScenario = {
    name: 'join',
    run: async (context) => {
        const { client, server } = context;
        const announced = client.waitForLine(/joined the game/, 90_000);
        await joinWorld(context);
        await announced;

        const listed = server.waitForLine(/There are 1 players online/, 10_000);
        server.command('list');
        await listed;

        const disconnected = client.waitForLine(/Client disconnected|Disconnected from|Lost connection/, STAY_MS).then(
            (line) => line,
            () => undefined
        );
        const line = await disconnected;
        if (line !== undefined) throw new Error(`the client was disconnected: ${line}`);
    }
};
