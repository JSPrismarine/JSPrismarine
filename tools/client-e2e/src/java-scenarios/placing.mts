/**
 * A Java player places a block from its hotbar: it is given stone, which lands in the slot it
 * holds, looks at the ground in front of it and uses the stone, and the world has stone there.
 */
import { USE_KEY } from '../headlessmc.mts';
import type { JavaScenario } from '../java-run.mts';
import { inWorld, joinWorld } from './support.mts';

/** Where the player stands, facing north and 60 degrees down at the ground block in front of it. */
const STAND = { x: 0.5, y: -60, z: 0.5 };
/** The air above that ground block, where the stone goes. */
const PLACED = { x: 0, y: -60, z: -1 };

export const placing: JavaScenario = {
    name: 'placing',
    run: async (context) => {
        const { client, server } = context;
        await joinWorld(context);
        await inWorld(context);

        const given = server.waitForLine(/Gave 16 item/, 10_000);
        server.command('give @a minecraft:stone 16');
        await given;
        const moved = server.waitForLine(/Teleported 1 entit/, 10_000);
        server.command(`tp @a ${STAND.x} ${STAND.y} ${STAND.z} 180 60`);
        await moved;
        // The client takes the teleport and its new facing before it uses the stone.
        await new Promise((resolve) => setTimeout(resolve, 2_000));

        client.command(`key ${USE_KEY}`);
        await new Promise((resolve) => setTimeout(resolve, 2_000));

        const answered = server.waitForLine(/Found the block at|The block is /, 10_000);
        server.command(`testforblock ${PLACED.x} ${PLACED.y} ${PLACED.z} minecraft:stone`);
        const answer = await answered;
        if (!/Found the block at/.test(answer)) throw new Error(`no stone where the player placed it: ${answer}`);
    }
};
