/** Verifies two stacks a player drops merge into one on the client, and walking onto it picks both up. */
import assert from 'node:assert/strict';

import type { Scenario } from '../scenario.mts';
import { lookTo, sleep, waitTicks } from '../scenario.mts';

/** Counts item actors visible to the client. */
const itemActorCount = (state: Record<string, unknown>): number => {
    const actors = state.actors;
    assert.ok(Array.isArray(actors), 'state.actors is an array');
    return actors.filter(
        (actor) => typeof actor === 'object' && actor !== null && 'type' in actor && actor.type === 'minecraft:item'
    ).length;
};

export const itemDropPickup: Scenario = {
    name: 'item-drop-pickup',
    description: 'two dropped stacks merge into one item actor, and walking onto it picks both up',
    run: async ({ client, server, playerName, log }) => {
        await client.waitFor({ chunks_loaded: { radius: 2 } }, 30_000);

        const dirtHeld = async (): Promise<number> => {
            const counted = server.waitForLine(/Found \d+ matching/, 10_000);
            server.command(`clear ${playerName} minecraft:dirt 0`);
            return Number(/Found (\d+) matching/.exec(await counted)?.[1]);
        };

        // Start from a world with no drops.
        server.command('kill @e[type=item]');
        server.command(`clear ${playerName} minecraft:dirt`);
        await client.input({ hotbar: 1 });
        let deadline = Date.now() + 20_000;
        while (itemActorCount(await client.state()) > 0) {
            assert.ok(Date.now() < deadline, 'the client kept drawing item actors after they were killed');
            await sleep(250);
        }

        // Looking a little down, so both land a block or so ahead, from the same point at the
        // same speed: within half a block of each other, which is where stacks merge. One dirt
        // at a time, since `/replaceitem` with a count leaves the slot's two counts apart (#2957).
        await lookTo(client, 0, 30);
        for (let drop = 1; drop <= 2; drop += 1) {
            server.command(`replaceitem entity ${playerName} slot.hotbar 0 minecraft:dirt 1`);
            deadline = Date.now() + 20_000;
            while ((await dirtHeld()) !== 1) {
                assert.ok(Date.now() < deadline, 'the selected slot never held the dirt');
                await sleep(250);
            }
            await waitTicks(server, 2);
            await client.input({ press: ['key.drop'], press_frames: 2 });
            deadline = Date.now() + 20_000;
            while ((await dirtHeld()) > 0) {
                assert.ok(Date.now() < deadline, `the client dropped dirt ${drop}, but the server still holds it`);
                await sleep(250);
            }
        }

        // Both stacks have left the hand. They lie still within a second, and once the second
        // has been drawn into the first the client is left drawing one item actor.
        deadline = Date.now() + 20_000;
        let seen = itemActorCount(await client.state());
        while (seen !== 1) {
            assert.ok(Date.now() < deadline, `the two dropped stacks stayed ${seen} item actors on the client`);
            await sleep(250);
            seen = itemActorCount(await client.state());
        }
        // Still one a moment later: a merged survivor is not taken back apart.
        await waitTicks(server, 20);
        assert.equal(itemActorCount(await client.state()), 1, 'the merged stack split back into two actors');
        log('the two dropped stacks merged into one item actor');

        // The forty-tick pickup delay of a thrown stack has passed. Walk onto it.
        await client.input({ move: { forward: 1 } });
        deadline = Date.now() + 20_000;
        while (itemActorCount(await client.state()) > 0) {
            assert.ok(Date.now() < deadline, 'walking onto the merged stack never picked it up');
            await sleep(100);
        }
        await client.input({ move: { forward: 0 } });
        await client.input({ release_all: true });

        // Both of them, in one take: the merge moved the count onto the survivor.
        assert.equal(await dirtHeld(), 2, 'picking up the merged stack did not give back both dirt');
        log('walking onto the merged stack picked up both dirt');
    }
};
