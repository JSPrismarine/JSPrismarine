/**
 * A Java player is given items, which its client reads as the whole inventory window: a stack in
 * the hotbar and a helmet in the armor slots. A stack the client could not read would disconnect
 * it, which this watches for. Nothing the headless client prints lists the slots it holds, so where
 * each stack lands is checked by `JavaPresenter.test.ts`, and the `placing` scenario uses a given
 * stack.
 */
import type { JavaScenario } from '../java-run.mts';
import { inWorld, joinWorld } from './support.mts';

/** How long the client holds the inventory with nothing ending the connection. */
const WATCH_MS = 10_000;

export const inventory: JavaScenario = {
    name: 'inventory',
    run: async (context) => {
        const { client, server } = context;
        await joinWorld(context);
        await inWorld(context);

        const given = server.waitForLine(/Gave 32 item/, 10_000);
        server.command('give @a minecraft:stone 32');
        await given;
        const helmet = server.waitForLine(/Gave 1 item/, 10_000);
        server.command('give @a minecraft:iron_helmet 1');
        await helmet;

        const disconnected = await client
            .waitForLine(/Client disconnected|Disconnected from|Lost connection|Failed to decode/, WATCH_MS)
            .then(
                (line) => line,
                () => undefined
            );
        if (disconnected !== undefined) throw new Error(`the client was disconnected: ${disconnected}`);
    }
};
