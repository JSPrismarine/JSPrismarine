/**
 * A Java player in the Nether stays there: sent there by a command, and again after logging back
 * in, as a linked account whose Bedrock play left it in the Nether logs in. The test server's
 * Nether floor is at y 4 and its Overworld's at y -60. A client shown the Overworld at the
 * Nether's coordinates has nothing under it, falls to the Overworld's floor, and its moves take
 * the server's player down with it, which is what the server's selector watches for. Nothing the
 * headless client prints names its dimension, so which `Respawn` it is sent is checked by
 * `JavaPresenter.test.ts` and `PlayerSessionDimensionChange.test.ts`.
 */
import type { JspServer } from '../jsp-server.mts';
import type { JavaScenario } from '../java-run.mts';
import { inWorld, joinWorld } from './support.mts';

/** Where the player is sent: the middle of the Nether floor's top, which is at y 3. */
const ARRIVAL = { x: 0.5, y: 4, z: 0.5 };

/** How long the client is given to load the Nether and fall, if it was shown the wrong world. */
const SETTLE_MS = 5_000;

/** Whether the server holds a player standing on the Nether floor around the arrival. */
const standsInNether = async (server: JspServer): Promise<boolean> => {
    const marker = `nether-check-${Date.now()}`;
    const said = server.waitForLine(new RegExp(marker), 5_000).then(
        () => true,
        () => false
    );
    server.command(`execute in minecraft:the_nether if entity @a[x=-8,y=3,z=-8,dx=16,dy=3,dz=16] run say ${marker}`);
    return said;
};

/** Waits for the client to settle, then fails unless the player still stands in the Nether. */
const expectInNether = async (server: JspServer, when: string): Promise<void> => {
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
    if (!(await standsInNether(server))) throw new Error(`the Java player left the Nether floor ${when}`);
};

export const dimensions: JavaScenario = {
    name: 'dimensions',
    run: async (context) => {
        const { client, server, javaPort } = context;
        await joinWorld(context);
        await inWorld(context);

        const teleported = server.waitForLine(/Teleported/, 10_000);
        server.command(`execute in minecraft:the_nether run tp @a ${ARRIVAL.x} ${ARRIVAL.y} ${ARRIVAL.z}`);
        await teleported;
        await expectInNether(server, 'after a teleport there');

        // Logged out in the Nether, and back.
        const left = server.waitForLine(/Java Edition player \S+ .*(left|disconnected)|left the game/i, 15_000);
        server.command('kick @a');
        await left.catch(() => undefined);
        await joinWorld({ client, server, javaPort });
        await inWorld(context);
        await expectInNether(server, 'after logging back in');
    }
};
