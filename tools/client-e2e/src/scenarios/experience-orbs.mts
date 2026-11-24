/**
 * Verifies the experience a mined ore drops reaches the client as orbs, and that the orbs fly to the
 * player standing near them and are collected as experience.
 */
import assert from 'node:assert/strict';

import type { Scenario } from '../scenario.mts';
import { lookTo, sleep, vec3 } from '../scenario.mts';

/** Counts experience orbs visible to the client. */
const orbCount = (state: Record<string, unknown>): number => {
    const actors = state.actors;
    assert.ok(Array.isArray(actors), 'state.actors is an array');
    return actors.filter(
        (actor) => typeof actor === 'object' && actor !== null && 'type' in actor && actor.type === 'minecraft:xp_orb'
    ).length;
};

export const experienceOrbs: Scenario = {
    name: 'experience-orbs',
    description: 'a mined diamond ore drops experience orbs, which fly to the player and are collected',
    run: async ({ server, client, playerName, log }) => {
        await client.waitFor({ chunks_loaded: { radius: 2 } }, 120_000);

        const experience = async (unit: 'levels' | 'points'): Promise<number> => {
            const reply = server.waitForLine(new RegExp(`${playerName} has (\\d+) ${unit}`), 10_000);
            server.command(`xp query ${playerName} ${unit}`);
            return Number(new RegExp(`has (\\d+) ${unit}`).exec(await reply)?.[1]);
        };

        // Start with no orbs and no experience, holding a pickaxe that mines diamond ore.
        server.command('kill @e[type=xp_orb]');
        server.command(`xp set ${playerName} 0 levels`);
        server.command(`xp set ${playerName} 0 points`);
        server.command(`replaceitem entity ${playerName} slot.hotbar 0 minecraft:diamond_pickaxe`);
        await client.input({ hotbar: 1 });
        let deadline = Date.now() + 20_000;
        while (orbCount(await client.state()) > 0) {
            assert.ok(Date.now() < deadline, 'the client kept drawing orbs after they were killed');
            await sleep(250);
        }

        // Diamond ore pays 3 to 7 points to a pickaxe without Silk Touch, so the break always drops orbs.
        const feet = vec3(await client.state(), 'feet');
        const x = Math.floor(feet[0]);
        const y = Math.floor(feet[1]) + 1;
        const z = Math.floor(feet[2]) + 3;
        await lookTo(client, 0, 0);
        server.command(`setblock ${x} ${y - 1} ${z} minecraft:stone`);
        server.command(`setblock ${x} ${y} ${z} minecraft:diamond_ore`);
        await sleep(250);

        // Watch for orbs from the moment the attack starts: the player stands within the range orbs
        // fly in from, so on a fast host they can be collected before a check made after the break.
        let seen = 0;
        await client.input({ hold: ['key.attack'] });
        const brokeBy = Date.now() + 15_000;
        for (let poll = 0; ; poll += 1) {
            seen = Math.max(seen, orbCount(await client.state()));
            if (poll % 5 === 0) {
                const reply = server.waitForLine(/Found the block at|The block is |That chunk is not loaded/, 10_000);
                server.command(`testforblock ${x} ${y} ${z} minecraft:air`);
                if (/Found the block at/.test(await reply)) break;
                assert.ok(Date.now() < brokeBy, 'the diamond ore was never broken');
            }
            await sleep(50);
        }
        await client.input({ release_all: true });

        // Orbs three blocks off are within the range a player draws them from, so the client sees
        // them appear and then leave as the player takes them.
        const appearBy = Date.now() + 10_000;
        while (seen === 0 && Date.now() < appearBy) {
            seen = orbCount(await client.state());
            if (seen === 0) await sleep(50);
        }
        assert.ok(seen > 0, 'the client never drew an orb from the broken diamond ore');
        deadline = Date.now() + 20_000;
        while (orbCount(await client.state()) > 0) {
            assert.ok(Date.now() < deadline, 'the orbs were never collected by the player standing near them');
            await sleep(100);
        }

        const levels = await experience('levels');
        const points = await experience('points');
        assert.ok(levels > 0 || points > 0, `the player has ${levels} levels and ${points} points after the orbs`);
        log(`the client saw ${seen} orbs, which the player collected into ${levels} levels and ${points} points`);
    }
};
