/**
 * A Java player sees what a mob holds: a skeleton, which always spawns with a bow, is summoned
 * beside it, and the bow reaches the client as `Set Equipment` after the spawn. Then a zombie is
 * summoned and `/replaceitem` puts an iron helmet on its head, which reaches the client as a
 * second `Set Equipment` (#3567, where the command refused every mob). A packet the client could
 * not read would disconnect it, which this watches for. Which slots and items it is sent are
 * checked by `JavaPresenter.test.ts` and the replicator's tests.
 */
import type { JavaScenario } from '../java-run.mts';
import { inWorld, joinWorld } from './support.mts';

/** How long the client holds the armed mobs, after the last command, with nothing ending the connection. */
const WATCH_MS = 10_000;

/** How long each server command may take to answer. */
const COMMAND_MS = 10_000;

/** What the client prints when the connection ends, a packet it could not read among them. */
const DISCONNECT = /Client disconnected|Disconnected from|Lost connection|Failed to decode/;

export const equipment: JavaScenario = {
    name: 'equipment',
    run: async (context) => {
        const { client, server } = context;
        await joinWorld(context);
        await inWorld(context);

        // Watched from before the first command, since `waitForLine` sees only lines printed after
        // it starts: a decode failure while the commands run would otherwise go unnoticed.
        const disconnected = client.waitForLine(DISCONNECT, 3 * COMMAND_MS + WATCH_MS).then(
            (line) => line,
            () => undefined
        );

        const summoned = server.waitForLine(/[Ss]ummoned/, COMMAND_MS);
        server.command('summon minecraft:skeleton 2 -60 2');
        await summoned;

        const zombie = server.waitForLine(/[Ss]ummoned/, COMMAND_MS);
        server.command('summon minecraft:zombie -2 -60 2');
        await zombie;
        const helmeted = server.waitForLine(
            /Replaced slot\.armor\.head slot 0 of .* with 1 \* minecraft:iron_helmet/,
            COMMAND_MS
        );
        server.command('replaceitem entity @e[type=zombie] slot.armor.head 0 minecraft:iron_helmet');
        await helmeted;

        const ended = await Promise.race([
            disconnected,
            new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), WATCH_MS))
        ]);
        if (ended !== undefined) throw new Error(`the client was disconnected: ${ended}`);
    }
};
