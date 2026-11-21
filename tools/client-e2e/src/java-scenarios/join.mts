/**
 * A Java client logs in and is configured with vanilla's registries and tags, which it accepts;
 * the server then ends the join as the client reaches play, until Java players can play.
 */
import type { JavaScenario } from '../java-run.mts';

export const join: JavaScenario = {
    name: 'join',
    run: async ({ client, server, javaPort }) => {
        const loggedIn = server.waitForLine(/Java Edition player \S+ \([0-9a-f-]+\) logged in/);
        client.command(`connect localhost ${javaPort}`);
        await loggedIn;
        // The play-phase refusal: one the client got past configuration to read.
        await client.waitForLine(
            /Client disconnected with reason: This server does not take Java Edition players yet\./
        );
    }
};
