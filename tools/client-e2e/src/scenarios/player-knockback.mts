/**
 * Verifies a blow's knockback on a player: the server asks the client to take the shove, the
 * client moves the player, and the server keeps the position the client reports rather than
 * putting the player back (ADR 0008).
 */
import assert from 'node:assert/strict';

import type { Scenario } from '../scenario.mts';
import { sleep, standAt, vec3 } from '../scenario.mts';

/** Where the player stands, on a stone pad; the pig stands two blocks west of it. */
const STAND = { x: 0.5, y: 64, z: 0.5 };

export const playerKnockback: Scenario = {
    name: 'player-knockback',
    description: 'a blow from a mob shoves the player away from it, and the shove sticks',
    run: async ({ client, server, playerName, log }) => {
        const padReady = server.waitForLine(/knockback-fixture-ready/, 15_000);
        server.command('fill -4 63 -4 8 63 4 minecraft:stone');
        server.command(`gamemode survival ${playerName}`);
        server.command('say knockback-fixture-ready');
        await padReady;
        await standAt({ server, client, playerName }, STAND);

        server.command(`summon minecraft:pig ${STAND.x - 2} ${STAND.y} ${STAND.z}`);
        await sleep(500);
        const before = vec3(await client.state(), 'feet');
        server.command(`damage ${playerName} 1 minecraft:mob_attack by @e[type=minecraft:pig,limit=1]`);

        // Away from the pig, so east. The client runs the shove through its own physics.
        const deadline = Date.now() + 10_000;
        let shoved = before;
        for (;;) {
            shoved = vec3(await client.state(), 'feet');
            if (shoved[0] - before[0] > 0.25) break;
            assert.ok(Date.now() < deadline, `the player was never shoved; feet stayed at ${shoved.join(', ')}`);
            await sleep(100);
        }

        // A server that moved the player itself, or refused the client's reports, would put the
        // player back where the blow found them.
        await sleep(2_000);
        const settled = vec3(await client.state(), 'feet');
        assert.ok(
            settled[0] - before[0] > 0.25,
            `the shove was undone: feet went from ${before.join(', ')} to ${shoved.join(', ')} and back to ${settled.join(', ')}`
        );

        server.command('kill @e[type=minecraft:pig]');
        log(`shoved from x ${before[0].toFixed(2)} to ${settled[0].toFixed(2)}`);
    }
};
