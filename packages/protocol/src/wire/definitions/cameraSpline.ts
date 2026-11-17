/**
 * The custom camera splines a world's behavior packs define.
 *
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/camera-spline-packet/}
 */
import { isEasingFunction } from '../../structure/CameraInstruction';
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { EasingFunction } from '../../structure/CameraInstruction';
import type { PayloadOf } from '../define';
import type { Vec3Like, WireType } from '../fieldTypes';
import { ProtocolWireErrors } from '@jsprismarine/errors/protocol/wire';

/**
 * `easing_function`: a string naming one of the enum's 32 values; decoding rejects any other name.
 * The packet lists `easing` as optional, so it is a presence bool then the string, `null` when absent.
 */
const easing: WireType<EasingFunction | null> = t.custom(
    'optional<easing_function>',
    (s, v) => t.optional(t.string).write(s, v),
    (s) => {
        const name = t.optional(t.string).read(s);
        if (name !== null && !isEasingFunction(name)) {
            throw new ProtocolWireErrors.UnknownEasingFunction({ name });
        }
        return name;
    }
);

/** One `CameraSplineProgressKeyFrame`: how far along the spline the camera is at a given time. */
export interface SplineProgressKeyFrame {
    /** `progress` along the spline, 0 at the start and 1 at the end. */
    progress: number;
    /** `time` in seconds at which the camera reaches `progress`. */
    time: number;
    /** `easing` towards this frame, or `null` when linear. */
    easing: EasingFunction | null;
}

/** One `CameraSplineRotationKeyFrame`: the camera rotation at a given time. */
export interface SplineRotationKeyFrame {
    /** `rotation` as x, y and z angles. */
    rotation: Vec3Like;
    /** `time` in seconds at which the camera reaches `rotation`. */
    time: number;
    /** `easing` towards this frame, or `null` when linear. */
    easing: EasingFunction | null;
}

/** One `CameraSplineDefinition`: a named camera path `/camera` plays back by name. */
export interface SplineDefinition {
    /** `name`, "namespace:name". */
    name: string;
    /** `total_time`, the playback length in seconds. */
    totalTime: number;
    /** `spline_type`, "catmullrom" or "linear". A plain string on the wire, not optional. */
    splineType: string;
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
        t.string.write(s, v.splineType);
        t.list(t.vec3).write(s, v.controlPoints);
        t.list(progressKeyFrame).write(s, v.progressKeyFrames);
        t.list(rotationKeyFrame).write(s, v.rotationKeyFrames);
    },
    (s) => ({
        name: t.string.read(s),
        totalTime: t.lf32.read(s),
        splineType: t.string.read(s),
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
