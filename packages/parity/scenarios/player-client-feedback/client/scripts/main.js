/**
 * The `client` pack of the `player-client-feedback` scenario. Once the scenario's client has
 * joined, the pack sends it music, a property override, a client message and camera splines, and
 * records what each call returns or throws. What reaches the client is checked against BDS's
 * packets in `packages/prismarine`'s unit tests; this records the script's side.
 *
 * Every observation is stamped with tick 0, since when the client joins depends on the network.
 *
 * `packages/parity/src/scripting/record.ts` defines the format.
 */

import { CatmullRomSpline, LinearSpline, system, world } from '@minecraft/server';

const PACK = 'client';
/** How long the pack waits after the client appears, so it has finished joining. */
const JOIN_TICKS = 20;
let seq = 0;

/** Logs one observation, stamped with the pack's sequence number and tick 0. */
const record = (event, observed = {}) => {
    seq += 1;
    console.warn(`DUMP record ${JSON.stringify({ pack: PACK, seq, tick: 0, event, ...observed })}`);
};

/** Records what a call returns, or the error it throws. */
const attempt = (event, call) => {
    try {
        const value = call();
        record(event, { value: value === undefined ? 'undefined' : value });
    } catch (error) {
        record(event, { error: String(error) });
    }
};

/** A spline of a class over points, as `Camera.playAnimation` takes it. */
const spline = (Class, points) => {
    const made = new Class();
    made.controlPoints = points;
    return made;
};

const POINTS = [
    { x: 1, y: 2, z: 3 },
    { x: 4, y: 5, z: 6 },
    { x: 7, y: 8, z: 9 }
];
const NO_FRAMES = { progressKeyFrames: [], rotationKeyFrames: [] };

const run = (player) => {
    attempt('playMusic', () => player.playMusic('music.game', { fade: 1, loop: true, volume: 0.5 }));
    attempt('playMusic louder than 1', () => player.playMusic('music.game', { volume: 2 }));
    attempt('playMusic with a negative fade', () => player.playMusic('music.game', { fade: -1 }));
    attempt('queueMusic', () => player.queueMusic('record.13', { fade: 2 }));
    attempt('queueMusic with a negative fade', () => player.queueMusic('record.13', { fade: -1 }));
    attempt('stopMusic', () => player.stopMusic());
    attempt('postClientMessage', () => player.postClientMessage('jsp:hello', 'world'));
    attempt('postClientMessage empty', () => player.postClientMessage('jsp:empty', ''));
    attempt('controlPoints read back', () => spline(LinearSpline, POINTS).controlPoints);
    attempt('playAnimation linear', () =>
        player.camera.playAnimation(spline(LinearSpline, POINTS.slice(0, 2)), {
            totalTimeSeconds: 2,
            animation: NO_FRAMES
        })
    );
    attempt('playAnimation linear with one point', () =>
        player.camera.playAnimation(spline(LinearSpline, POINTS.slice(0, 1)), {
            totalTimeSeconds: 2,
            animation: NO_FRAMES
        })
    );
    attempt('playAnimation catmull-rom with two points', () =>
        player.camera.playAnimation(spline(CatmullRomSpline, POINTS.slice(0, 2)), {
            totalTimeSeconds: 2,
            animation: NO_FRAMES
        })
    );
    attempt('playAnimation catmull-rom with key frames', () =>
        player.camera.playAnimation(spline(CatmullRomSpline, POINTS), {
            totalTimeSeconds: 4,
            animation: {
                progressKeyFrames: [
                    { alpha: 0, timeSeconds: 0 },
                    { alpha: 1, timeSeconds: 4, easingFunc: 'InOutSine' }
                ],
                rotationKeyFrames: [{ rotation: { x: 10, y: 20, z: 30 }, timeSeconds: 0 }]
            }
        })
    );
    attempt('playAnimation with a late first progress key frame', () =>
        player.camera.playAnimation(spline(LinearSpline, POINTS), {
            totalTimeSeconds: 2,
            animation: { progressKeyFrames: [{ alpha: 0.5, timeSeconds: 1 }], rotationKeyFrames: [] }
        })
    );
    attempt('playAnimation with a late first rotation key frame', () =>
        player.camera.playAnimation(spline(LinearSpline, POINTS), {
            totalTimeSeconds: 2,
            animation: {
                progressKeyFrames: [],
                rotationKeyFrames: [{ rotation: { x: 1, y: 2, z: 3 }, timeSeconds: 1 }]
            }
        })
    );
    attempt('playAnimation with both key frames late and one point', () =>
        player.camera.playAnimation(spline(LinearSpline, POINTS.slice(0, 1)), {
            totalTimeSeconds: 2,
            animation: {
                progressKeyFrames: [{ alpha: 0.5, timeSeconds: 1 }],
                rotationKeyFrames: [{ rotation: { x: 1, y: 2, z: 3 }, timeSeconds: 1 }]
            }
        })
    );
    attempt('playAnimation with a late first progress key frame and one point', () =>
        player.camera.playAnimation(spline(LinearSpline, POINTS.slice(0, 1)), {
            totalTimeSeconds: 2,
            animation: { progressKeyFrames: [{ alpha: 0.5, timeSeconds: 1 }], rotationKeyFrames: [] }
        })
    );
    attempt('playAnimation with no time', () =>
        player.camera.playAnimation(spline(LinearSpline, POINTS.slice(0, 2)), {
            totalTimeSeconds: 0,
            animation: NO_FRAMES
        })
    );
    system.runTimeout(() => console.warn(`DUMP end ${JSON.stringify({ pack: PACK, records: seq })}`), 20);
};

record('ready for the client');
const waiting = system.runInterval(() => {
    const [player] = world.getAllPlayers();
    if (player === undefined) return;
    system.clearRun(waiting);
    system.runTimeout(() => {
        record('client joined');
        run(player);
    }, JOIN_TICKS);
}, 1);
