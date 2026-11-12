/** Verifies an idle player stays still for an observer and movement still reaches that observer. */
import assert from 'node:assert/strict';
import type { Scenario } from '../scenario.mts';
import { distance, sleep, vec3, waitForActor, waitTicks } from '../scenario.mts';

export const movementFanout: Scenario = {
    name: 'movement-fanout',
    description: "idle movement stays quiet and an observer sees a player's walk",
    run: async ({ client, server, createClient, playerName, log }) => {
        const observer = await createClient('jsp-e2e-observer');
        const still = await waitForActor(observer, playerName);
        await waitTicks(server, 30);
        const stillAfterWait = await waitForActor(observer, playerName);
        assert.ok(
            distance(still, stillAfterWait) < 0.1,
            `observer saw idle player drift from ${still.join(', ')} to ${stillAfterWait.join(', ')}`
        );

        const before = vec3(await client.state(), 'feet');
        await client.input({ move: { forward: 1 } });
        await sleep(3000);
        await client.input({ move: { forward: 0 }, release_all: true });
        const after = vec3(await client.state(), 'feet');
        const walked = distance(before, after);
        assert.ok(walked > 1, `player walked ${walked.toFixed(2)} blocks; expected more than 1`);

        const deadline = Date.now() + 15_000;
        let observed = await waitForActor(observer, playerName);
        while (distance(stillAfterWait, observed) < 1 && Date.now() < deadline) {
            await sleep(250);
            observed = await waitForActor(observer, playerName);
        }
        const observedWalk = distance(stillAfterWait, observed);
        assert.ok(
            observedWalk > 1,
            `observer saw the player move ${observedWalk.toFixed(2)} blocks; expected more than 1 ` +
                `(from ${stillAfterWait.join(', ')} to ${observed.join(', ')})`
        );
        log(`observer saw ${observedWalk.toFixed(2)} blocks of movement after the idle period`);
    }
};
