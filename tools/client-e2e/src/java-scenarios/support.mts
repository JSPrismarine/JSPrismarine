/** Steps more than one Java scenario takes. */
import type { JavaScenarioContext } from '../java-run.mts';

/**
 * Connects the client and waits until it is in the world: logged in, and with no screen open,
 * which `gui` says in words once the loading screen has closed over the chunks under the player.
 */
export const joinWorld = async ({ client, server, javaPort }: JavaScenarioContext): Promise<void> => {
    const loggedIn = server.waitForLine(/Java Edition player \S+ \([0-9a-f-]+\) logged in/);
    client.command(`connect localhost ${javaPort}`);
    await loggedIn;

    const deadline = Date.now() + 60_000;
    for (;;) {
        const screen = client.waitForLine(/^Screen: |not displaying a Gui/, 5_000);
        client.command('gui');
        const line = await screen;
        if (/not displaying a Gui/.test(line)) return;
        if (Date.now() > deadline) throw new Error(`the client never left the loading screen: ${line}`);
        await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
};
