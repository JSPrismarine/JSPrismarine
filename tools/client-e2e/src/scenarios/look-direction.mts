/** Verifies the client's yaw decides which way forward is, in the server's coordinates. */
import assert from 'node:assert/strict';

import type { CinnabarClient } from '../client.mts';
import type { Scenario } from '../scenario.mts';
import { lookTo, sleep, vec3, waitTicks } from '../scenario.mts';

/** Bedrock yaw 0 faces +Z, 90 faces -X, 180 faces -Z, and 270 faces +X. */
const headings = [
    { yaw: 0, axis: 2, sign: 1, name: '+Z' },
    { yaw: 90, axis: 0, sign: -1, name: '-X' },
    { yaw: 180, axis: 2, sign: -1, name: '-Z' },
    { yaw: 270, axis: 0, sign: 1, name: '+X' }
] as const;

/** The few state fields that say why a walk went nowhere, kept short for the CI log. */
const diagnostics = async (client: CinnabarClient) => {
    const { feet, server_position, health, rotation, screens, dimension } = await client.state();
    return { feet, server_position, health, rotation, screens, dimension };
};

/** Waits until the client's feet stop moving for half a second. */
const settled = async (client: CinnabarClient): Promise<void> => {
    const deadline = Date.now() + 15_000;
    let last = vec3(await client.state(), 'feet');
    let stillSince = Date.now();
    while (Date.now() - stillSince < 500 && Date.now() < deadline) {
        await sleep(100);
        const feet = vec3(await client.state(), 'feet');
        if (Math.hypot(feet[0] - last[0], feet[2] - last[2]) > 0.02) stillSince = Date.now();
        last = feet;
    }
};

export const lookDirection: Scenario = {
    name: 'look-direction',
    description: 'walking forward after turning heads toward the matching world axis',
    run: async ({ client, server, playerName, log }) => {
        // A floor a late-released walk cannot leave: a starved client has covered 9 blocks. It goes
        // down in slabs, since one 625-block fill stalled a CI server for 3 s and a walk begun
        // inside that stall was held back by the server.
        for (let x = -12; x <= 12; x += 5) {
            server.command(`fill ${x} 63 -12 ${Math.min(x + 4, 12)} 63 12 minecraft:stone`);
            await waitTicks(server, 5);
        }

        for (const heading of headings) {
            // A starved client applies the release late and keeps walking; let it stop first, or
            // the walk carries on across the next heading.
            await settled(client);
            server.command(`teleport ${playerName} 0.5 64 0.5`);
            const deadline = Date.now() + 15_000;
            for (;;) {
                const feet = vec3(await client.state(), 'feet');
                if (Math.hypot(feet[0] - 0.5, feet[1] - 64, feet[2] - 0.5) < 0.5) break;
                assert.ok(Date.now() < deadline, `client did not reach the center; still at ${feet.join(', ')}`);
                await sleep(250);
            }

            await lookTo(client, heading.yaw, 0);
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
                    // The first click after a reset is also what makes the client take gameplay
                    // input; with nothing held it does nothing else.
                    await client.input({ press: ['MouseRight'], press_frames: 1 });
                    await client.input({ release_all: true });
                    await lookTo(client, heading.yaw, 0);
                    await client.input({ move: { forward: 1 } });
                    lastProgress = Date.now();
                }
            }
            await client.input({ move: { forward: 0 }, release_all: true });

            feet = vec3(await client.state(), 'feet');
            const along = (feet[heading.axis] - 0.5) * heading.sign;
            const across = Math.abs(feet[heading.axis === 0 ? 2 : 0] - 0.5);
            assert.ok(
                along > 2,
                `facing yaw ${heading.yaw} moved ${along.toFixed(2)} along ${heading.name}; ${JSON.stringify(await diagnostics(client))}`
            );
            assert.ok(across < 1, `facing yaw ${heading.yaw} drifted ${across.toFixed(2)} sideways`);
            log(`yaw ${heading.yaw} walked ${along.toFixed(2)} blocks toward ${heading.name}`);
        }
    }
};
