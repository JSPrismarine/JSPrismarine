/**
 * Verifies a behavior pack script turns a player the client sees: `/scriptevent e2e:look` runs
 * the script's `scriptEventReceive` after-event, which turns every player with
 * `Entity.setRotation`, and the client's own heading follows.
 */
import assert from 'node:assert/strict';

import { isPublishedPlatform, platformKey } from '../../../../packages/script-host/src/platform.ts';
import { SCRIPT_LOOK_EVENT, SCRIPT_LOOK_ROTATION } from '../jsp-server.mts';
import type { Scenario } from '../scenario.mts';
import { sleep } from '../scenario.mts';

/** How far the client's heading may land from where the script turned it, in degrees. */
const TOLERANCE = 1;

export const scriptRotation: Scenario = {
    name: 'script-rotation',
    description: "a behavior pack script's Entity.setRotation turns the player, and the client's heading follows",
    run: async ({ client, server, log }) => {
        // A platform without a published script host build runs the server
        // without scripts, which this scenario cannot check.
        if (!isPublishedPlatform()) {
            log(`skipped: the script host has no build for ${platformKey()}, so the server runs no scripts`);
            return;
        }
        server.command(`scriptevent ${SCRIPT_LOOK_EVENT}`);
        const deadline = Date.now() + 15_000;
        for (;;) {
            const rotation = (await client.state()).rotation;
            const yaw =
                typeof rotation === 'object' && rotation !== null && 'yaw' in rotation ? rotation.yaw : undefined;
            const pitch =
                typeof rotation === 'object' && rotation !== null && 'pitch' in rotation ? rotation.pitch : undefined;
            if (typeof yaw === 'number' && typeof pitch === 'number') {
                // Yaw wraps, so compare the shortest way around.
                const yawGap = Math.abs(((((yaw - SCRIPT_LOOK_ROTATION.y) % 360) + 540) % 360) - 180);
                if (yawGap < TOLERANCE && Math.abs(pitch - SCRIPT_LOOK_ROTATION.x) < TOLERANCE) break;
            }
            assert.ok(
                Date.now() < deadline,
                `the client never turned to yaw ${SCRIPT_LOOK_ROTATION.y} pitch ${SCRIPT_LOOK_ROTATION.x}; it is at ${JSON.stringify(rotation)}`
            );
            await sleep(250);
        }
        log(`the script turned the client to yaw ${SCRIPT_LOOK_ROTATION.y} pitch ${SCRIPT_LOOK_ROTATION.x}`);
    }
};
