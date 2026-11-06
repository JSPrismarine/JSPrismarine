/** Verifies the client's yaw decides which way forward is, in the server's coordinates. */
import assert from 'node:assert/strict';

import type { Scenario } from '../scenario.mts';
import { sleep, vec3 } from '../scenario.mts';

/** Bedrock yaw 0 faces +Z, 90 faces -X, 180 faces -Z, and 270 faces +X. */
const headings = [
    { yaw: 0, axis: 2, sign: 1, name: '+Z' },
    { yaw: 90, axis: 0, sign: -1, name: '-X' },
    { yaw: 180, axis: 2, sign: -1, name: '-Z' },
    { yaw: 270, axis: 0, sign: 1, name: '+X' }
] as const;

export const lookDirection: Scenario = {
    name: 'look-direction',
    description: 'walking forward after turning heads toward the matching world axis',
    run: async ({ client, server, playerName, log }) => {
        server.command('fill -12 63 -12 12 63 12 minecraft:stone');

        for (const heading of headings) {
            server.command(`teleport ${playerName} 0.5 64 0.5`);
            const deadline = Date.now() + 15_000;
            for (;;) {
                const feet = vec3(await client.state(), 'feet');
                if (Math.hypot(feet[0] - 0.5, feet[1] - 64, feet[2] - 0.5) < 0.5) break;
                assert.ok(Date.now() < deadline, `client did not reach the center; still at ${feet.join(', ')}`);
                await sleep(250);
            }

            await client.input({ look: { yaw: heading.yaw, pitch: 0, frames: 0 } });
            await client.input({ move: { forward: 1 } });
            // Walk until the distance is covered rather than for a fixed second: a loaded CI
            // client has been measured walking 1.3 blocks in that second, a third of what a
            // walking player covers, and the heading is what this scenario is about.
            const walkDeadline = Date.now() + 8_000;
            let feet = vec3(await client.state(), 'feet');
            let lastAlong = (feet[heading.axis] - 0.5) * heading.sign;
            let lastProgress = Date.now();
            while ((feet[heading.axis] - 0.5) * heading.sign <= 2 && Date.now() < walkDeadline) {
                await sleep(250);
                feet = vec3(await client.state(), 'feet');
                const along = (feet[heading.axis] - 0.5) * heading.sign;
                if (along - lastAlong > 0.1) {
                    lastAlong = along;
                    lastProgress = Date.now();
                } else if (Date.now() - lastProgress > 1_500) {
                    // A slow runner can lose the start of the key press; ask again.
                    await client.input({ look: { yaw: heading.yaw, pitch: 0, frames: 0 } });
                    await client.input({ move: { forward: 1 } });
                    lastProgress = Date.now();
                }
            }
            await client.input({ move: { forward: 0 }, release_all: true });

            feet = vec3(await client.state(), 'feet');
            const along = (feet[heading.axis] - 0.5) * heading.sign;
            const across = Math.abs(feet[heading.axis === 0 ? 2 : 0] - 0.5);
            assert.ok(along > 2, `facing yaw ${heading.yaw} moved ${along.toFixed(2)} along ${heading.name}`);
            assert.ok(across < 1, `facing yaw ${heading.yaw} drifted ${across.toFixed(2)} sideways`);
            log(`yaw ${heading.yaw} walked ${along.toFixed(2)} blocks toward ${heading.name}`);
        }
    }
};
