/** Verifies a player still walks for an observer while `/tick freeze` holds the world still. */
import assert from 'node:assert/strict';
import type { Scenario } from '../scenario.mts';
import { distance, gameTime, sleep, vec3, waitForActor } from '../scenario.mts';

export const frozenWorld: Scenario = {
    name: 'frozen-world',
    description: "a frozen world's clock stands still and an observer still sees a player's walk",
    run: async ({ client, server, createClient, playerName, log }) => {
        const observer = await createClient('jsp-e2e-frozen');
        const start = await waitForActor(observer, playerName);

        const frozen = server.waitForLine(/The game is frozen/, 10_000);
        server.command('tick freeze');
        // Inside the cleanup: a freeze that took but whose line never came still has to be undone,
        // or every later scenario of the suite runs in a frozen world.
        try {
            await frozen;
            const frozenAt = await gameTime(server);

            const before = vec3(await client.state(), 'feet');
            await client.input({ move: { forward: 1 } });
            await sleep(3000);
            await client.input({ move: { forward: 0 }, release_all: true });
            const after = vec3(await client.state(), 'feet');
            const walked = distance(before, after);
            assert.ok(walked > 1, `player walked ${walked.toFixed(2)} blocks; expected more than 1`);

            // Before the unfreeze: a frozen tick sends what its inputs did, so the observer sees the
            // walk while the world holds still, not all at once when it starts again.
            const deadline = Date.now() + 15_000;
            let observed = await waitForActor(observer, playerName);
            while (distance(start, observed) < 1 && Date.now() < deadline) {
                await sleep(250);
                observed = await waitForActor(observer, playerName);
            }
            const observedWalk = distance(start, observed);
            assert.ok(
                observedWalk > 1,
                `observer saw the player move ${observedWalk.toFixed(2)} blocks while frozen; expected more than 1 ` +
                    `(from ${start.join(', ')} to ${observed.join(', ')})`
            );
            assert.equal(await gameTime(server), frozenAt, "the world's clock moved while frozen");
            log(`observer saw ${observedWalk.toFixed(2)} blocks of movement in a frozen world`);
        } finally {
            server.command('tick unfreeze');
        }
    }
};
