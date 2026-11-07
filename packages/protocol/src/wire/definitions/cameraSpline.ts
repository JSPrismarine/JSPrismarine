/**
 * The custom camera splines a world's behavior packs define.
 *
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/types/camera-spline-definition/}
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { PayloadOf } from '../define';
import type { Vec3Like } from '../fieldTypes';

/** An `easing_function` name, absent when the frame is linear. The schema lists it outside `required`. */
const easing = t.optional(t.string);

/** One `CameraSplineProgressKeyFrame`: how far along the spline the camera is at a given time. */
export interface SplineProgressKeyFrame {
    /** `progress` along the spline, 0 at the start and 1 at the end. */
    progress: number;
    /** `time` in seconds at which the camera reaches `progress`. */
    time: number;
    /** `easing` towards this frame, or `null` when linear. */
    easing: string | null;
}

/** One `CameraSplineRotationKeyFrame`: the camera rotation at a given time. */
export interface SplineRotationKeyFrame {
    /** `rotation` as x, y and z angles. */
    rotation: Vec3Like;
    /** `time` in seconds at which the camera reaches `rotation`. */
    time: number;
    /** `easing` towards this frame, or `null` when linear. */
    easing: string | null;
}

/** One `CameraSplineDefinition`: a named camera path `/camera` plays back by name. */
export interface SplineDefinition {
    /** `name`, "namespace:name". */
    name: string;
    /** `total_time`, the playback length in seconds. */
    totalTime: number;
    /** `spline_type`, or `null` for the Catmull-Rom default. */
    splineType: string | null;
    /** `control_points`, the positions the path passes through, in order. */
    controlPoints: Vec3Like[];
    /** `progress_key_frames`, when the camera reaches each point of the path. */
    progressKeyFrames: SplineProgressKeyFrame[];
    /** `rotation_key_frames`, the camera rotation over time. */
    rotationKeyFrames: SplineRotationKeyFrame[];
}

const progressKeyFrame = t.custom<SplineProgressKeyFrame>(
    'CameraSplineProgressKeyFrame',
    (s, v) => {
        t.lf32.write(s, v.progress);
        t.lf32.write(s, v.time);
        easing.write(s, v.easing);
    },
    (s) => ({ progress: t.lf32.read(s), time: t.lf32.read(s), easing: easing.read(s) })
);

const rotationKeyFrame = t.custom<SplineRotationKeyFrame>(
    'CameraSplineRotationKeyFrame',
    (s, v) => {
        t.vec3.write(s, v.rotation);
        t.lf32.write(s, v.time);
        easing.write(s, v.easing);
    },
    (s) => ({ rotation: t.vec3.read(s), time: t.lf32.read(s), easing: easing.read(s) })
);

/** `CameraSplineDefinition`: the six fields in wire order. */
export const splineDefinition = t.custom<SplineDefinition>(
    'CameraSplineDefinition',
    (s, v) => {
        t.string.write(s, v.name);
        t.lf32.write(s, v.totalTime);
        t.optional(t.string).write(s, v.splineType);
        t.list(t.vec3).write(s, v.controlPoints);
        t.list(progressKeyFrame).write(s, v.progressKeyFrames);
        t.list(rotationKeyFrame).write(s, v.rotationKeyFrames);
    },
    (s) => ({
        name: t.string.read(s),
        totalTime: t.lf32.read(s),
        splineType: t.optional(t.string).read(s),
        controlPoints: t.list(t.vec3).read(s),
        progressKeyFrames: t.list(progressKeyFrame).read(s),
        rotationKeyFrames: t.list(rotationKeyFrame).read(s)
    })
);

/** The `CameraSplinePacket` field list. */
export const cameraSplinePacket = definePacket('CameraSplinePacket', {
    /** `Camera Data Splines`: one definition per named spline. */
    splines: t.list(splineDefinition)
});

/** Hands the client the custom camera splines of the world's behavior packs. */
export type CameraSplinePayload = PayloadOf<typeof cameraSplinePacket>;
