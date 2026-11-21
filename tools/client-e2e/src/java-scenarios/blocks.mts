/**
 * Blocks changed near a Java player reach its client: one block alone, as `Block Update`, and a
 * fill, as `Update Section Blocks`. A packet the client could not read would disconnect it, which
 * this watches for. Nothing the headless client prints shows a block it holds, so which state ids
 * it is sent is checked by `JavaPresenter.test.ts`.
 */
import type { JavaScenario } from '../java-run.mts';
import { joinWorld } from './support.mts';

/** How long the client holds the changed blocks with nothing ending the connection. */
const WATCH_MS = 10_000;

export const blocks: JavaScenario = {
    name: 'blocks',
    run: async (context) => {
        const { client, server } = context;
        await joinWorld(context);

        const placed = server.waitForLine(/Placed the block/, 10_000);
        server.command('setblock 3 -60 3 minecraft:oak_log');
        await placed;
        const filled = server.waitForLine(/[Ff]illed/, 10_000);
        server.command('fill -2 -60 -6 2 -58 -4 minecraft:stone_bricks');
        await filled;

        const disconnected = await client
            .waitForLine(/Client disconnected|Disconnected from|Lost connection|Failed to decode/, WATCH_MS)
            .then(
                (line) => line,
                () => undefined
            );
        if (disconnected !== undefined) throw new Error(`the client was disconnected: ${disconnected}`);
    }
};
