/** Verifies what a player keeps through a death and a respawn, with `keepInventory` off and on. */
import assert from 'node:assert/strict';

import type { JspServer } from '../jsp-server.mts';
import type { Scenario } from '../scenario.mts';
import { respawnFromDeathScreen, standAt, waitTicks } from '../scenario.mts';

/** How many stone the player holds, through `/clear` with a max count of 0, which removes nothing. */
const stoneHeld = async (server: JspServer, playerName: string): Promise<number> => {
    const answer = server.waitForLine(/Found \d+ matching items?/, 10_000);
    server.command(`clear ${playerName} minecraft:stone 0`);
    return Number(/Found (\d+)/.exec(await answer)?.[1]);
};

/** The player's experience level, through `/xp query`. */
const levelOf = async (server: JspServer, playerName: string): Promise<number> => {
    const answer = server.waitForLine(new RegExp(`${playerName} has \\d+ levels`), 10_000);
    server.command(`xp query ${playerName} levels`);
    return Number(/has (\d+) levels/.exec(await answer)?.[1]);
};

export const deathInventory: Scenario = {
    name: 'death-inventory',
    description: 'a death drops the inventory and the experience without keepInventory, and keeps both with it',
    run: async ({ client, server, playerName, log }) => {
        // A pad at the spawn and one well away from it, at the height the scenarios stand on, so
        // the player dies to `/kill` rather than a fall and respawns out of reach of its drop.
        server.command('fill -2 63 -2 2 63 2 minecraft:stone');
        server.command('fill 22 63 -2 26 63 2 minecraft:stone');
        server.command('setworldspawn 0 63 0');
        server.command('kill @e[type=item]');
        await waitTicks(server, 5);

        for (const keep of [false, true]) {
            server.command(`gamerule keepInventory ${String(keep)}`);
            server.command(`clear ${playerName}`);
            server.command(`give ${playerName} minecraft:stone 5`);
            server.command(`xp set ${playerName} 12 levels`);
            await waitTicks(server, 5);
            assert.equal(await stoneHeld(server, playerName), 5, 'the player was not given the stone');

            // Away from the spawn, so the respawned player does not pick its own drop back up.
            await standAt({ server, client, playerName }, { x: 24.5, y: 64, z: 0.5 });
            server.command(`kill ${playerName}`);
            await respawnFromDeathScreen(client, server);
            await waitTicks(server, 10);

            const stone = await stoneHeld(server, playerName);
            const level = await levelOf(server, playerName);
            if (keep) {
                assert.equal(stone, 5, `keepInventory true lost the stone: ${stone} left`);
                assert.equal(level, 12, `keepInventory true lost the experience: level ${level}`);
            } else {
                assert.equal(stone, 0, `keepInventory false kept ${stone} stone`);
                assert.equal(level, 0, `keepInventory false kept level ${level}`);
            }
            log(`keepInventory ${String(keep)}: ${stone} stone and level ${level} after the respawn`);
            // The death's orbs lie where the next round stands, and a player now collects them.
            server.command('kill @e[type=item]');
            server.command('kill @e[type=xp_orb]');
        }
        server.command('gamerule keepInventory false');
    }
};
