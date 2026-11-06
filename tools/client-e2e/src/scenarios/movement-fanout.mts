/** Verifies an idle player stays still for an observer and movement still reaches that observer. */
import assert from 'node:assert/strict';
import type { CinnabarClient } from '../client.mts';
import type { Scenario } from '../scenario.mts';
import { sleep, vec3 } from '../scenario.mts';

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const actorPosition = (state: Record<string, unknown>, name: string): [number, number, number] | undefined => {
    if (!Array.isArray(state.actors)) return undefined;
    const actor = state.actors.find((candidate) => isRecord(candidate) && candidate.name === name);
    if (!isRecord(actor)) return undefined;
    return vec3(actor, 'position');
};

const waitForActor = async (client: CinnabarClient, name: string): Promise<[number, number, number]> => {
    const deadline = Date.now() + 60_000;
    for (;;) {
        const position = actorPosition(await client.state(), name);
        if (position !== undefined) return position;
        if (Date.now() >= deadline) throw new Error(`observer never listed player ${name}`);
        await sleep(250);
    }
};

const distance = (left: readonly [number, number, number], right: readonly [number, number, number]): number =>
    Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);

export const movementFanout: Scenario = {
    name: 'movement-fanout',
    description: "idle movement stays quiet and an observer sees a player's walk",
    run: async ({ client, createClient, playerName, log }) => {
        const observer = await createClient('jsp-e2e-observer');
        const still = await waitForActor(observer, playerName);
        await sleep(1500);
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
