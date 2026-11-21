/**
 * A Java player in creative breaks the block under its feet: the client sends `Player Action`,
 * the server breaks the block and answers the prediction, and the world no longer has it.
 */
import { ATTACK_KEY } from '../headlessmc.mts';
import type { JavaScenario } from '../java-run.mts';
import { joinWorld } from './support.mts';

/** The grass block the player stands on, looking straight down at it. */
const GROUND = { x: 0, y: -61, z: 0 };

export const mining: JavaScenario = {
    name: 'mining',
    run: async (context) => {
        const { client, server } = context;
        await joinWorld(context);

        // The player is in the world once its client says it loaded, which selectors then find.
        const deadline = Date.now() + 30_000;
        for (;;) {
            const found = server.waitForLine(/Found \d+ entit/, 10_000);
            server.command('testfor @a');
            if (/Found [1-9]/.test(await found)) break;
            if (Date.now() > deadline) throw new Error('the Java player never entered the world');
            await new Promise((resolve) => setTimeout(resolve, 1_000));
        }

        const creative = server.waitForLine(/Set the game mode of 1 player/, 10_000);
        server.command('gamemode creative @a');
        await creative;
        const moved = server.waitForLine(/Teleported 1 entit/, 10_000);
        server.command(`tp @a ${GROUND.x + 0.5} ${GROUND.y + 1} ${GROUND.z + 0.5} 0 90`);
        await moved;
        // The client takes the teleport and its new facing before it mines.
        await new Promise((resolve) => setTimeout(resolve, 2_000));

        client.command(`key ${ATTACK_KEY}`);
        await new Promise((resolve) => setTimeout(resolve, 2_000));

        const answered = server.waitForLine(/Found the block at|The block is /, 10_000);
        server.command(`testforblock ${GROUND.x} ${GROUND.y} ${GROUND.z} minecraft:air`);
        const answer = await answered;
        if (!/Found the block at/.test(answer)) throw new Error(`the block under the player is still there: ${answer}`);
    }
};
