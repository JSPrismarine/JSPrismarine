/**
 * Verifies a mob standing partly inside a block walks out of it, as Java's collision lets it.
 *
 * A spawner used to place mobs with their box reaching into its own block, and the server refused
 * every step such a mob took, so it stood still with its goals running. Summoning the zombie into
 * the side of a pillar sets up the same overlap with commands alone.
 */
import assert from 'node:assert/strict';

import type { Scenario } from '../scenario.mts';
import { advanceTicks } from '../scenario.mts';

/** The pillar's x; the zombie's box, 0.6 wide around x 7, reaches back into it to 6.7. */
const PILLAR_X = 6;
const ZOMBIE_X = 7;

/** Reads the first zombie's position from `data get entity`. */
const zombieX = async (server: Parameters<Scenario['run']>[0]['server']): Promise<number> => {
    const answer = server.waitForLine(/has the following entity data: \[(-?[\d.]+)d/, 10_000);
    server.command('data get entity @e[type=minecraft:zombie,limit=1] Pos');
    const match = /has the following entity data: \[(-?[\d.]+)d/.exec(await answer);
    assert.ok(match?.[1] !== undefined, 'the server reported the zombie position');
    return Number(match[1]);
};

export const mobLeavesBlock: Scenario = {
    name: 'mob-leaves-block',
    description: 'a zombie summoned partly inside a pillar walks out of it toward the player',
    run: async ({ client, server, playerName, log }) => {
        await client.waitFor({ chunks_loaded: { radius: 2 } }, 30_000);
        server.command(`teleport ${playerName} 11.5 -60 6.5`);
        server.command(`fill ${PILLAR_X} -60 6 ${PILLAR_X} -58 6 minecraft:stone`);
        server.command(`summon minecraft:zombie ${ZOMBIE_X} -60 6.5`);

        assert.equal(await zombieX(server), ZOMBIE_X, 'the zombie stands where it was summoned');
        // A zombie targets a player within its follow range and walks at it, so it heads east,
        // out of the pillar, as soon as it can move at all.
        await advanceTicks(server, 100);
        const after = await zombieX(server);

        server.command('kill @e[type=minecraft:zombie]');
        server.command(`fill ${PILLAR_X} -60 6 ${PILLAR_X} -58 6 minecraft:air`);

        assert.ok(after > ZOMBIE_X + 0.5, `the zombie left the pillar: it stands at x ${after}`);
        log(`the zombie walked from x ${ZOMBIE_X} to x ${after.toFixed(2)}`);
    }
};
