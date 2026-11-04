/** Verifies a server title command reaches the client's HUD. */
import assert from 'node:assert/strict';

import type { Scenario } from '../scenario.mts';
import { sleep } from '../scenario.mts';

export const title: Scenario = {
    name: 'title',
    description: 'a title and subtitle sent from the server show on the client HUD',
    run: async ({ client, server, playerName, log }) => {
        const marker = `Hello-${Date.now()}`;
        server.command(`title ${playerName} times 0 100 0`);
        server.command(`title ${playerName} subtitle sub-${marker}`);
        server.command(`title ${playerName} title ${marker}`);

        const deadline = Date.now() + 15_000;
        for (;;) {
            const hud = JSON.stringify((await client.state()).hud);
            if (hud.includes(marker) && hud.includes(`sub-${marker}`)) break;
            assert.ok(Date.now() < deadline, `HUD never showed the title; hud: ${hud}`);
            await sleep(250);
        }
        log(`HUD showed ${marker}`);
    }
};
