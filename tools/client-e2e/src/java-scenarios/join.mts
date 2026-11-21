/**
 * A Java client joins: it logs in, is configured with vanilla's registries and tags, loads the
 * world around spawn, and is a player in it, which the console's `list` counts.
 */
import type { JavaScenario } from '../java-run.mts';
import { joinWorld } from './support.mts';

/** How long the client must stay in the world with nothing ending its connection: past two keep-alives and the client's own 30-second timeout. */
const STAY_MS = 40_000;

export const join: JavaScenario = {
    name: 'join',
    run: async (context) => {
        const { client, server } = context;
        await joinWorld(context);

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
