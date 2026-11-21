/**
 * A Java player dies and comes back: `/kill` opens its client's death screen, from `Combat Death`,
 * and the screen's respawn button asks the server to respawn it. The client leaves the screen only
 * once the server's `Respawn` arrives and the chunks around where it comes back are in.
 */
import type { JavaClient } from '../headlessmc.mts';
import type { JavaScenario } from '../java-run.mts';
import { inWorld, joinWorld } from './support.mts';

/** The death screen's respawn button, as `gui` numbers the screen's buttons. */
const RESPAWN_BUTTON = 1;

/**
 * Asks the client which screen it shows until `wanted` matches, once a second.
 * @returns The last answer.
 */
const awaitScreen = async (client: JavaClient, wanted: RegExp, what: string): Promise<string> => {
    const deadline = Date.now() + 30_000;
    for (;;) {
        const shown = client.waitForLine(/^Screen: |not displaying a Gui/, 5_000).then(
            (line) => line,
            // A busy client can take longer than that to answer; the next poll asks again.
            () => 'no answer'
        );
        client.command('gui');
        const screen = await shown;
        if (wanted.test(screen)) return screen;
        if (Date.now() > deadline) throw new Error(`the client never ${what}: ${screen}`);
        await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
};

/**
 * Waits until the death screen's respawn button takes clicks: the screen holds its buttons
 * inactive for its first second, and a click before then does nothing.
 */
const respawnButtonActive = async (client: JavaClient): Promise<void> => {
    const deadline = Date.now() + 15_000;
    for (;;) {
        const row = client.waitForLine(new RegExp(`^${RESPAWN_BUTTON}\\s+Respawn\\s`), 5_000).then(
            (line) => line,
            () => ''
        );
        client.command('gui');
        // The row's `on` column, after the text and the four numbers of its bounds.
        if (/Respawn(\s+\d+){4}\s+1\s/.test(await row)) return;
        if (Date.now() > deadline) throw new Error('the respawn button never became active');
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
};

export const respawn: JavaScenario = {
    name: 'respawn',
    run: async (context) => {
        const { client, server } = context;
        await joinWorld(context);
        await inWorld(context);

        const killed = server.waitForLine(/Killed/, 10_000);
        server.command('kill @a');
        await killed;
        await awaitScreen(client, /DeathScreen/, 'showed its death screen');
        await respawnButtonActive(client);

        client.command(`click ${RESPAWN_BUTTON}`);
        await awaitScreen(client, /not displaying a Gui/, 'came back from its death screen');
    }
};
