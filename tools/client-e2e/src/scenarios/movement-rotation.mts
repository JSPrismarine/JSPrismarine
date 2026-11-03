/** Verifies ordinary movement does not rewind the player's own look rotation. */
import assert from 'node:assert/strict';
import type { Scenario } from '../scenario.mts';
import { sleep } from '../scenario.mts';

const rotationOf = (state: Record<string, unknown>): { yaw: number; pitch: number } => {
    const rotation = state.rotation;
    if (
        typeof rotation !== 'object' ||
        rotation === null ||
        !('yaw' in rotation) ||
        !('pitch' in rotation) ||
        typeof rotation.yaw !== 'number' ||
        typeof rotation.pitch !== 'number'
    ) {
        throw new Error(`state.rotation is not a yaw/pitch pair: ${JSON.stringify(rotation)}`);
    }

    return { yaw: rotation.yaw, pitch: rotation.pitch };
};

export const movementRotation: Scenario = {
    name: 'movement-rotation',
    description: "ordinary movement keeps the client's own reported look rotation",
    run: async ({ client, log }) => {
        const expected = { yaw: 123, pitch: 17 };
        await client.input({ look: { ...expected, frames: 0 } });

        const deadline = Date.now() + 1000;
        let samples = 0;
        while (Date.now() < deadline) {
            const observed = rotationOf(await client.state());
            assert.ok(
                Math.abs(observed.yaw - expected.yaw) < 0.5 && Math.abs(observed.pitch - expected.pitch) < 0.5,
                `client look changed during movement: expected yaw/pitch ${expected.yaw}/${expected.pitch}, ` +
                    `observed ${observed.yaw}/${observed.pitch}`
            );
            samples++;
            await sleep(80);
        }

        log(`kept yaw ${expected.yaw} and pitch ${expected.pitch} across ${samples} state samples`);
    }
};
