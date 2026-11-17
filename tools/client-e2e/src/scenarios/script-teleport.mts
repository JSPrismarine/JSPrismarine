/**
 * Verifies a behavior pack script moves a player the client sees: `/weather thunder` runs the
 * script's `weatherChange` after-event, which teleports every player from `world.getAllPlayers`
 * east by `SCRIPT_TELEPORT_DISTANCE` blocks through `Entity.teleport`, and the client's own
 * position follows.
 */
import assert from 'node:assert/strict';

import { NATIVE_BUILD_PLATFORMS } from '../../../../packages/script-host/src/platform.ts';
import { SCRIPT_TELEPORT_DISTANCE } from '../jsp-server.mts';
import type { Scenario } from '../scenario.mts';
import { sleep, vec3 } from '../scenario.mts';

/** How far the client's position may land from where the script sent it, in blocks. */
const TOLERANCE = 0.5;

export const scriptTeleport: Scenario = {
    name: 'script-teleport',
    description: "a behavior pack script's Entity.teleport moves the player, and the client's position follows",
    run: async ({ client, server, log }) => {
        // The script host builds on Linux only for now (issue #3215); elsewhere the server runs
        // without scripts, which this scenario cannot check.
        if (!NATIVE_BUILD_PLATFORMS.includes(process.platform)) {
            log(`skipped: the script host has no build for ${process.platform}, so the server runs no scripts`);
            return;
        }
        const [startX, , startZ] = vec3(await client.state(), 'feet');
        const expectedX = startX + SCRIPT_TELEPORT_DISTANCE;
        server.command('weather thunder');
        try {
            const deadline = Date.now() + 15_000;
            for (;;) {
                const [x, , z] = vec3(await client.state(), 'feet');
                if (Math.abs(x - expectedX) <= TOLERANCE && Math.abs(z - startZ) <= TOLERANCE) break;
                assert.ok(
                    Date.now() < deadline,
                    `the client never reached x ${expectedX} from x ${startX}; it is at ${x}, ${z}`
                );
                await sleep(250);
            }
            log(`the script moved the client from x ${startX} to x ${expectedX}`);
        } finally {
            server.command('weather clear');
        }
    }
};
