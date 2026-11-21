/**
 * A Java client joins: it logs in, is configured with vanilla's registries and tags, and is shown
 * the world around spawn, which it renders without being disconnected.
 */
import type { JavaScenario } from '../java-run.mts';

/** How long the client must stay in the world with nothing ending its connection: past two keep-alives and the client's own 30-second timeout. */
const STAY_MS = 40_000;

export const join: JavaScenario = {
    name: 'join',
    run: async ({ client, server, javaPort }) => {
        const loggedIn = server.waitForLine(/Java Edition player \S+ \([0-9a-f-]+\) logged in/);
        client.command(`connect localhost ${javaPort}`);
        await loggedIn;

        // In the world, no screen is open, which `gui` says in words: the loading screen closes
        // once the chunks under the player have arrived.
        const deadline = Date.now() + 60_000;
        for (;;) {
            const screen = client.waitForLine(/^Screen: |not displaying a Gui/, 5_000);
            client.command('gui');
            const line = await screen;
            if (/not displaying a Gui/.test(line)) break;
            if (Date.now() > deadline) throw new Error(`the client never left the loading screen: ${line}`);
            await new Promise((resolve) => setTimeout(resolve, 1_000));
        }

        const disconnected = client.waitForLine(/Client disconnected|Disconnected from|Lost connection/, STAY_MS).then(
            (line) => line,
            () => undefined
        );
        const line = await disconnected;
        if (line !== undefined) throw new Error(`the client was disconnected: ${line}`);
    }
};
