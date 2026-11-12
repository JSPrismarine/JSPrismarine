/** Verifies a powered piston cannot displace bedrock in a loaded client world. */
import assert from 'node:assert/strict';

import type { Scenario } from '../scenario.mts';
import { placeBlockAndWait, testForBlock, waitTicks } from '../scenario.mts';

/** Powers ordinary and sticky pistons facing bedrock and checks the terrain stays intact. */
export const pistonBedrock: Scenario = {
    name: 'piston-bedrock',
    description: 'powered pistons leave bedrock in its original position',
    run: async ({ client, server, playerName }) => {
        server.command(`gamemode creative ${playerName}`);
        server.command(`teleport ${playerName} 64.5 66 0.5`);
        await waitTicks(server, 40);
        await client.waitFor({ chunks_loaded: { radius: 2 } }, 60_000);
        for (const [index, piston] of ['minecraft:piston', 'minecraft:sticky_piston'].entries()) {
            const x = 64 + index * 4;
            const bedrock = { x, y: 65, z: 2 };
            const destination = { x, y: 65, z: 3 };
            await placeBlockAndWait(server, destination, 'minecraft:air');
            await placeBlockAndWait(server, bedrock, 'minecraft:bedrock');
            await placeBlockAndWait(server, { x, y: 65, z: 1 }, `${piston} ["facing_direction"=2]`);
            await placeBlockAndWait(server, { x, y: 65, z: 0 }, 'minecraft:redstone_block');
            await waitTicks(server, 20);
            assert.match(await testForBlock(server, bedrock, 'minecraft:bedrock'), /Found the block at/);
            assert.match(await testForBlock(server, destination, 'minecraft:air'), /Found the block at/);
            // Confirm this same powered fixture can move an ordinary block.
            await placeBlockAndWait(server, { x, y: 65, z: 0 }, 'minecraft:air');
            await waitTicks(server, 20);
            await placeBlockAndWait(server, bedrock, 'minecraft:stone');
            await placeBlockAndWait(server, { x, y: 65, z: 0 }, 'minecraft:redstone_block');
            await waitTicks(server, 20);
            assert.match(await testForBlock(server, destination, 'minecraft:stone'), /Found the block at/);
        }
    }
};
