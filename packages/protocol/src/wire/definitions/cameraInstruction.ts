/**
 * `CameraInstructionPacket`: tells a client's camera what to do.
 *
 * The payload is one `CameraInstruction`, nine parts each behind a presence byte: `Set`,
 * `Clear`, `Fade`, `Target`, `RemoveTarget`, `FieldOfView`, `Spline`, `AttachToEntity`,
 * `DetachFromEntity`. A set instruction's `preset` indexes the list the server sent in
 * `CameraPresetsPacket`.
 *
 * The 1.26.50 page lists the nine parts and the optional parts inside them as required; the
 * 1.26.60 page marks them optional, and its release notes say the change corrects the docs'
 * optionality, not the wire (`docs/research/protocol-2225-delta.md`). The layout is the same at
 * protocol 2193 and 2225. `splineIdentifier` and `loadFromJson` are plain values on both pages.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/camera-instruction-packet/
 */
import { isEasingFunction } from '../../structure/CameraInstruction';
import Vec2 from '../../structure/Vec2';
import Vec3 from '../../structure/Vec3';
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type {
    CameraEase,
    CameraFadeColor,
    CameraFadeInstruction,
    CameraFadeTime,
    CameraFovInstruction,
    CameraInstructionData,
    CameraSetInstruction,
    CameraSplineInstruction,
    CameraSplineProgressKeyFrame,
    CameraSplineRotationKeyFrame,
    CameraTargetInstruction,
    EasingFunction
} from '../../structure/CameraInstruction';
import type { PayloadOf } from '../define';
import type { WireType } from '../fieldTypes';

/**
 * A presence byte, then the value when the byte is 1. Absent is `undefined`, which is how the
 * camera structures leave an optional part out; the vocabulary's `optional` uses `null`.
 */
const present = <T>(of: WireType<T>): WireType<T | undefined> =>
    t.custom(
        `optional<${of.wire}>`,
        (stream, value) => {
            stream.writeBoolean(value !== undefined);
            if (value !== undefined) of.write(stream, value);
        },
        (stream) => (stream.readBoolean() ? of.read(stream) : undefined)
    );

/**
 * The named fields of an interface as one unit, written and read in declaration order. An
 * optional property takes a {@link present} wire type, so its key may be missing on write and
 * is left `undefined` on read.
 */
const struct = <T extends object>(fields: { [K in keyof T]-?: WireType<T[K]> }): WireType<T> => {
    const entries = Object.entries<WireType<unknown>>(fields);
    return t.custom(
        `struct<${entries.map(([key, of]) => `${key}: ${of.wire}`).join(', ')}>`,
        (stream, value) => {
            for (const [key, of] of entries) of.write(stream, Reflect.get(value, key));
        },
        (stream) => {
            const values = Object.fromEntries(entries.map(([key, of]) => [key, of.read(stream)]));
            // The entries are exactly the keys of `fields`, which the compiler cannot follow.
            return values as T;
        }
    );
};

/** `Vec2` as the camera structures carry it: two little-endian floats in a `Vec2` instance. */
const vec2: WireType<Vec2> = t.custom(
    'Vec2',
    (stream, value) => {
        stream.writeFloatLE(value.x);
        stream.writeFloatLE(value.y);
    },
    (stream) => new Vec2(stream.readFloatLE(), stream.readFloatLE())
);

/** `Vec3` as the camera structures carry it: three little-endian floats in a `Vec3` instance. */
const vec3: WireType<Vec3> = t.custom(
    'Vec3',
    (stream, value) => {
        stream.writeFloatLE(value.x);
        stream.writeFloatLE(value.y);
        stream.writeFloatLE(value.z);
    },
    (stream) => new Vec3(stream.readFloatLE(), stream.readFloatLE(), stream.readFloatLE())
);

/** `easing_function`: a string naming one of the docs' easing functions; decoding rejects any other name. */
const easingFunction: WireType<EasingFunction> = t.custom(
    'easing_function',
    (stream, value) => t.string.write(stream, value),
    (stream) => {
        const name = t.string.read(stream);
        if (!isEasingFunction(name)) {
            throw new Error(`Unknown easing_function "${name}"`);
        }
        return name;
    }
);

/** `CameraInstruction::SetInstruction::EaseOption`: a uint8 easing type, then the time in seconds. */
const ease = struct<CameraEase>({ type: t.uint8, time: t.lf32 });

/** `CameraInstruction::SetInstruction`: switch to a preset, with optional overrides. */
const setInstruction = struct<CameraSetInstruction>({
    preset: t.lu32,
    ease: present(ease),
    position: present(vec3),
    rotation: present(vec2),
    facing: present(vec3),
    viewOffset: present(vec2),
    entityOffset: present(vec3),
    default: present(t.bool),
    removeIgnoreStartingValuesComponent: t.bool
});

/** `CameraInstruction::FadeInstruction`: fade the screen to a color and back. */
const fadeInstruction = struct<CameraFadeInstruction>({
    time: present(struct<CameraFadeTime>({ fadeInTime: t.lf32, holdTime: t.lf32, fadeOutTime: t.lf32 })),
    color: present(struct<CameraFadeColor>({ red: t.lf32, green: t.lf32, blue: t.lf32 }))
});

/** `CameraInstruction::TargetInstruction`: point aim assist at an actor. */
const targetInstruction = struct<CameraTargetInstruction>({
    targetCenterOffset: present(vec3),
    targetActorId: t.li64
});

/** `CameraInstruction::FovInstruction`: change the field of view over time. */
const fovInstruction = struct<CameraFovInstruction>({
    fieldOfView: t.lf32,
    easeTime: t.lf32,
    easeType: easingFunction,
    clear: t.bool
});

/** `CameraInstruction::SplineInstruction`: move the camera along a curve. */
const splineInstruction = struct<CameraSplineInstruction>({
    totalTime: t.lf32,
    type: t.uint8,
    curve: t.list(vec3),
    progressKeyFrames: t.list(
        struct<CameraSplineProgressKeyFrame>({ value: t.lf32, time: t.lf32, easing: easingFunction })
    ),
    rotationKeyFrames: t.list(
        struct<CameraSplineRotationKeyFrame>({ value: vec3, time: t.lf32, easing: easingFunction })
    ),
    splineIdentifier: t.string,
    loadFromJson: t.bool
});

/** `CameraInstruction`: the nine parts in wire order, each behind a presence byte. */
const cameraInstruction = struct<CameraInstructionData>({
    set: present(setInstruction),
    clear: present(t.bool),
    fade: present(fadeInstruction),
    target: present(targetInstruction),
    removeTarget: present(t.bool),
    fieldOfView: present(fovInstruction),
    spline: present(splineInstruction),
    attachToEntity: present(t.li64),
    detachFromEntity: present(t.bool)
});

/** The fields sent when a client's camera is instructed. */
export const cameraInstructionPacket = definePacket('CameraInstructionPacket', {
    /** `Camera Instruction`: the parts the client applies, in wire order. */
    cameraInstruction
});

/** Payload carried by `CameraInstructionPacket`. */
export type CameraInstructionPayload = PayloadOf<typeof cameraInstructionPacket>;
