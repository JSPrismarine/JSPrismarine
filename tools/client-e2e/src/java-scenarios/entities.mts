/**
 * A mob near a Java player is shown to it, moves on its screen and catches fire. The client reads
 * the spawn, the moves and the burning entity data the server sends; one it could not read would
 * disconnect it, which this watches for. Nothing the headless client prints counts the entities it
 * holds, so the spawn itself is checked by `JavaPresenter.test.ts`.
 */
import type { JavaScenario } from '../java-run.mts';
import { joinWorld } from './support.mts';

/** How long the mob moves on the client's screen with nothing ending the connection. */
const WATCH_MS = 15_000;

export const entities: JavaScenario = {
    name: 'entities',
    run: async (context) => {
        const { client, server } = context;
        await joinWorld(context);

        const summoned = server.waitForLine(/[Ss]ummoned/, 10_000);
        server.command('summon minecraft:cow 2 -60 2');
        await summoned;
        // Lava on the cow sets it burning, which reaches the client as its entity data.
        const poured = server.waitForLine(/Placed the block/, 10_000);
        server.command('setblock 2 -60 2 minecraft:lava');
        await poured;

        const disconnected = await client
            .waitForLine(/Client disconnected|Disconnected from|Lost connection|Failed to decode/, WATCH_MS)
            .then(
                (line) => line,
                () => undefined
            );
        if (disconnected !== undefined) throw new Error(`the client was disconnected: ${disconnected}`);
    }
};
