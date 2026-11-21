/**
 * Verifies the packets a behavior pack script sends one player's client reach it and decode:
 * `/scriptevent e2e:feedback` makes the script play music for the player, override a pig's
 * property for them, move their camera to the free preset and play a camera spline. The client
 * keeps its music and overrides to itself, but it reports the server camera it follows and every
 * spline it could not play, so the scenario checks the camera took the spline and the client is
 * still in the world.
 */
import assert from 'node:assert/strict';

import { platformKey } from '../../../../packages/native-library/src/platform.ts';
import { isPublishedPlatform } from '../../../../packages/script-host/src/platform.ts';
import { SCRIPT_FEEDBACK_EVENT } from '../jsp-server.mts';
import type { Scenario } from '../scenario.mts';
import { sleep } from '../scenario.mts';

/** The server camera the client reports, as far as this scenario reads it. */
const serverCameraOf = (camera: unknown) => {
    if (typeof camera !== 'object' || camera === null) return undefined;
    const preset = 'preset' in camera ? camera.preset : undefined;
    const poseOverride = 'pose_override' in camera ? camera.pose_override : undefined;
    const skips = 'skips' in camera ? camera.skips : undefined;
    // The client prints its skip counters with Rust's Debug format, `ServerCameraSkips { invalid_splines: 0, .. }`.
    const invalid = typeof skips === 'string' ? /invalid_splines: (\d+)/.exec(skips)?.[1] : undefined;
    return { preset, poseOverride: poseOverride === true, invalidSplines: Number(invalid ?? 0) };
};

export const scriptClientFeedback: Scenario = {
    name: 'script-client-feedback',
    description:
        "a behavior pack script's music, property override and camera spline reach the client, which follows the spline",
    run: async ({ client, server, log }) => {
        if (!isPublishedPlatform(platformKey())) {
            log(`skipped: the script host has no build for ${platformKey()}, so the server runs no scripts`);
            return;
        }
        server.command(`scriptevent ${SCRIPT_FEEDBACK_EVENT} start`);
        try {
            const deadline = Date.now() + 15_000;
            for (;;) {
                const state = await client.state();
                assert.equal(state.in_world, true, 'the client left the world after the script feedback');
                const camera = serverCameraOf(state.server_camera);
                assert.equal(camera?.invalidSplines ?? 0, 0, 'the client could not play the camera spline');
                if (camera?.preset === 'minecraft:free' && camera.poseOverride) break;
                assert.ok(
                    Date.now() < deadline,
                    `the client never took the free camera; it reports ${JSON.stringify(state.server_camera)}`
                );
                await sleep(250);
            }
            log('the client follows the free camera and played the spline');
        } finally {
            server.command(`scriptevent ${SCRIPT_FEEDBACK_EVENT} end`);
        }
    }
};
