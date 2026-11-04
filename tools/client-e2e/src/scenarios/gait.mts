/** Verifies the client's walking, sprinting and sneaking speeds order the way vanilla's do. */
import assert from 'node:assert/strict';

import type { Scenario } from '../scenario.mts';
import { sleep, vec3 } from '../scenario.mts';

type Context = Parameters<Scenario['run']>[0];

/** Returns the player to the start of the stone strip and waits for the client to arrive. */
const returnToStart = async ({ client, server, playerName }: Context): Promise<void> => {
    server.command(`teleport ${playerName} 0.5 64 0.5`);
    const deadline = Date.now() + 15_000;
    for (;;) {
        const feet = vec3(await client.state(), 'feet');
        if (Math.hypot(feet[0] - 0.5, feet[1] - 64, feet[2] - 0.5) < 0.5) return;
        assert.ok(Date.now() < deadline, `client did not return to the start; still at ${feet.join(', ')}`);
        await sleep(250);
    }
};

/** Walks forward for a second and a half with the given modifiers and reports the distance. */
const travel = async (context: Context, modifiers: { sprint?: boolean; sneak?: boolean }): Promise<number> => {
    const { client } = context;
    await returnToStart(context);
    await client.input({ look: { yaw: 0, pitch: 0, frames: 0 } });
    const before = vec3(await client.state(), 'feet');
    await client.input({ move: { forward: 1 }, ...modifiers });
    await sleep(1_500);
    await client.input({ move: { forward: 0 }, sprint: false, sneak: false, release_all: true });
    const after = vec3(await client.state(), 'feet');
    return Math.hypot(after[0] - before[0], after[2] - before[2]);
};

export const gait: Scenario = {
    name: 'gait',
    description: 'sprinting outpaces walking and sneaking is slower than walking',
    run: async (context) => {
        const walk = await travel(context, {});
        const sprint = await travel(context, { sprint: true });
        const sneak = await travel(context, { sneak: true });

        assert.ok(sprint > walk * 1.1, `sprint covered ${sprint.toFixed(2)} blocks, walking ${walk.toFixed(2)}`);
        assert.ok(sneak < walk * 0.8, `sneak covered ${sneak.toFixed(2)} blocks, walking ${walk.toFixed(2)}`);
        context.log(`walk ${walk.toFixed(2)}, sprint ${sprint.toFixed(2)}, sneak ${sneak.toFixed(2)} blocks`);
    }
};
