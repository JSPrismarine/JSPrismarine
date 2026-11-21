/**
 * A Java player sees what a mob holds: a skeleton, which always spawns with a bow, is summoned
 * beside it, and the bow reaches the client as `Set Equipment` after the spawn. A packet the
 * client could not read would disconnect it, which this watches for. Which slots and items it is
 * sent, and a change of equipment, are checked by `JavaPresenter.test.ts` and the replicator's
 * tests: `/replaceitem` reaches players alone on this server.
 */
import type { JavaScenario } from '../java-run.mts';
import { inWorld, joinWorld } from './support.mts';

/** How long the client holds the armed skeleton with nothing ending the connection. */
const WATCH_MS = 10_000;

export const equipment: JavaScenario = {
    name: 'equipment',
    run: async (context) => {
        const { client, server } = context;
        await joinWorld(context);
        await inWorld(context);

        const summoned = server.waitForLine(/[Ss]ummoned/, 10_000);
        server.command('summon minecraft:skeleton 2 -60 2');
        await summoned;

        const disconnected = await client
            .waitForLine(/Client disconnected|Disconnected from|Lost connection|Failed to decode/, WATCH_MS)
            .then(
                (line) => line,
                () => undefined
            );
        if (disconnected !== undefined) throw new Error(`the client was disconnected: ${disconnected}`);
    }
};
