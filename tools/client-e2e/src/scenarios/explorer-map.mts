/** Verifies a shipwreck's treasure map reaches a real client as a filled map it can draw. */
import assert from 'node:assert/strict';
import path from 'node:path';

import { waitTicks } from '../scenario.mts';
import type { Scenario } from '../scenario.mts';

export const explorerMap: Scenario = {
    name: 'explorer-map',
    description: "a shipwreck map chest's treasure map reaches the client as a filled map, and the client draws it",
    serverOptions: { worldgenSpawn: true },
    run: async ({ client, server, playerName, artifacts, log }) => {
        await client.waitFor({ chunks_loaded: { radius: 2 } }, 180_000);
        server.command(`clear ${playerName}`);
        await waitTicks(server, 5);

        // The table's map pool keeps its map only once the search found a buried treasure and
        // the level gave the map an id; before #3530 it rolled none.
        server.command(`loot give ${playerName} loot minecraft:chests/shipwreck_map`);
        await waitTicks(server, 10);

        // Counted by its Bedrock name, so it arrived as a filled map rather than as Java's
        // `minecraft:buried_treasure_map`, which no Bedrock client has.
        const counted = server.waitForLine(/Found \d+ matching|No items were found/, 10_000);
        server.command(`clear ${playerName} minecraft:filled_map 0`);
        assert.match(await counted, /Found 1 matching item/, 'the treasure map reached the player as a filled map');

        // Held from the first hotbar slot, where the cleared inventory put it, so the client asks
        // for the map and draws the coast and the X the server sends.
        await client.input({ hotbar: 1 });
        // Looking down brings the whole held map into view.
        await client.input({ look: { yaw: 0, pitch: 70, frames: 0 } });
        await waitTicks(server, 40);
        await client.screenshot(path.join(artifacts, 'explorer-map-held.png'));
        log('the shipwreck treasure map reached the player as a filled map');
    }
};
