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
        const screen = client.waitForLine(/^Screen: |not displaying a Gui/, 5_000).then(
            (line) => line,
            // A busy client can take longer than that to answer; the next poll asks again.
            () => 'no answer'
        );
        client.command('gui');
        const line = await screen;
        if (/not displaying a Gui/.test(line)) return;
        if (Date.now() > deadline) throw new Error(`the client never left the loading screen: ${line}`);
        await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
};

/**
 * Waits until the player is in the world, where selectors such as `@a` find it: once its client
 * says it loaded, which follows the loading screen.
 */
export const inWorld = async ({ server }: JavaScenarioContext): Promise<void> => {
    const deadline = Date.now() + 30_000;
    for (;;) {
        const found = server.waitForLine(/Found \d+ entit/, 10_000);
        server.command('testfor @a');
        if (/Found [1-9]/.test(await found)) return;
        if (Date.now() > deadline) throw new Error('the Java player never entered the world');
        await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
};
