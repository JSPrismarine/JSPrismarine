import type { NetworkBinaryStream } from '../';
import NetworkStructure from '../NetworkStructure';
import Vec2 from './Vec2';
import Vec3 from './Vec3';

/**
 * The docs' `EasingType`: the uint8 `type` of a set instruction's `ease`. Lowercasing a member
 * name gives the `easing_function` string the FOV and spline instructions write instead
 * ({@link EasingFunction}).
 */
export enum EasingType {
    LINEAR = 0,
    SPRING = 1,
    IN_QUAD = 2,
    OUT_QUAD = 3,
    IN_OUT_QUAD = 4,
    IN_CUBIC = 5,
    OUT_CUBIC = 6,
    IN_OUT_CUBIC = 7,
    IN_QUART = 8,
    OUT_QUART = 9,
    IN_OUT_QUART = 10,
    IN_QUINT = 11,
    OUT_QUINT = 12,
    IN_OUT_QUINT = 13,
    IN_SINE = 14,
    OUT_SINE = 15,
    IN_OUT_SINE = 16,
    IN_EXPO = 17,
    OUT_EXPO = 18,
    IN_OUT_EXPO = 19,
    IN_CIRC = 20,
    OUT_CIRC = 21,
    IN_OUT_CIRC = 22,
    IN_BOUNCE = 23,
    OUT_BOUNCE = 24,
    IN_OUT_BOUNCE = 25,
    IN_BACK = 26,
    OUT_BACK = 27,
    IN_OUT_BACK = 28,
    IN_ELASTIC = 29,
    OUT_ELASTIC = 30,
    IN_OUT_ELASTIC = 31
}

/** An `easing_function` name as the wire carries it, for example "in_out_quad": a lowercase {@link EasingType} member. */
export type EasingFunction = Lowercase<keyof typeof EasingType>;

/** Whether a string read from the wire names one of the docs' `easing_function` values. */
export function isEasingFunction(name: string): name is EasingFunction {
    const member = name.toUpperCase();
    return Number.isNaN(Number(member)) && member in EasingType;
}

/** The `ease` of a set instruction, the docs' `CameraInstruction::SetInstruction::EaseOption`. */
export interface CameraEase {
    /** `type`, a uint8. */
    type: EasingType;
    /** `time` in seconds, float LE. */
    time: number;
}

/** The docs' `CameraInstruction::SetInstruction`: switch to a preset, with optional overrides. */
export interface CameraSetInstruction {
    /** `preset`, a uint32 LE index into the `CameraPresetsPacket` list. */
    preset: number;
    /** `ease`, optional. */
    ease?: CameraEase;
    /** `pos`, optional: the docs' `PosOption`, a Vec3. */
    position?: Vec3;
    /** `rot`, optional: the docs' `RotOption`, pitch `x` then yaw `y` as float LE. */
    rotation?: Vec2;
    /** `facing`, optional: the docs' `FacingOption`, a Vec3 the camera looks at. */
    facing?: Vec3;
    /** `view_offset`, optional: the docs' `ViewOffsetOption`, two float LE. */
    viewOffset?: Vec2;
    /** `entity_offset`, optional: the docs' `EntityOffsetOption`, three float LE. */
    entityOffset?: Vec3;
    /** `default`, optional: whether this becomes the player's default camera. */
    default?: boolean;
    /** `removeIgnoreStartingValuesComponent`, a boolean with no presence byte. */
    removeIgnoreStartingValuesComponent: boolean;
}

/** The `Time` of a fade, the docs' `CameraInstruction::FadeInstruction::TimeOption`: three float LE seconds. */
export interface CameraFadeTime {
    /** `Fade In Time`. */
    fadeInTime: number;
    /** `Hold Time`. */
    holdTime: number;
    /** `Fade Out Time`. */
    fadeOutTime: number;
}

/** The `Color` of a fade, the docs' `CameraInstruction::FadeInstruction::ColorOption`: three float LE channels from 0 to 1. */
export interface CameraFadeColor {
    /** `Red`. */
    red: number;
    /** `Green`. */
    green: number;
    /** `Blue`. */
    blue: number;
}

/** The docs' `CameraInstruction::FadeInstruction`: fade the screen to a color and back. */
export interface CameraFadeInstruction {
    /** `Time`, optional. */
    time?: CameraFadeTime;
    /** `Color`, optional. */
    color?: CameraFadeColor;
}

/** The docs' `CameraInstruction::TargetInstruction`: point aim assist at an actor. */
export interface CameraTargetInstruction {
    /** `Target Center Offset`, optional: a Vec3 from the actor's center. */
    targetCenterOffset?: Vec3;
    /** `Target Actor ID`, an int64 LE with no presence byte. */
    targetActorId: bigint;
}

/** The docs' `CameraInstruction::FovInstruction`: change the field of view over time. */
export interface CameraFovInstruction {
    /** `Field of View` in degrees, float LE. */
    fieldOfView: number;
    /** `FOV Ease Time` in seconds, float LE. */
    easeTime: number;
    /** `FOV Ease Type`, an `easing_function` written as a string. */
    easeType: EasingFunction;
    /** `Field of View Clear`: drop the override instead of applying one. */
    clear: boolean;
}

/** One `progressKeyFrames` entry, the docs' `CameraInstruction::SplineInstruction::SplineProgressOption`. */
export interface CameraSplineProgressKeyFrame {
    /** `Key frame value`, float LE: how far along the curve the camera is. */
    value: number;
    /** `Key frame time` in seconds, float LE. */
    time: number;
    /** `Key frame easing func`, an `easing_function` written as a string. */
    easing: EasingFunction;
}

/** One `rotationOption` entry, the docs' `CameraInstruction::SplineInstruction::SplineRotationOption`. */
export interface CameraSplineRotationKeyFrame {
    /** `Key frame value`, a Vec3 rotation. */
    value: Vec3;
    /** `Key frame time` in seconds, float LE. */
    time: number;
    /** `Key frame easing func`, an `easing_function` written as a string. */
    easing: EasingFunction;
}

/** The docs' `CameraInstruction::SplineInstruction`: move the camera along a curve. */
export interface CameraSplineInstruction {
    /** `totalTime` in seconds, float LE. */
    totalTime: number;
    /** `type`, a uint8 with no presence byte. The docs give it no enum. */
    type: number;
    /** `curve`: a varuint32 count, then one Vec3 per control point. */
    curve: Vec3[];
    /** `progressKeyFrames`: a varuint32 count, then the entries. */
    progressKeyFrames: CameraSplineProgressKeyFrame[];
    /** `rotationOption`: a varuint32 count, then the entries. */
    rotationKeyFrames: CameraSplineRotationKeyFrame[];
    /** `splineIdentifier`, optional: a named spline from `CameraSplinePacket` to load. */
    splineIdentifier?: string;
    /** `loadFromJson`, optional. */
    loadFromJson?: boolean;
}

/**
 * The fields of a `CameraInstruction`, in wire order. Each is a presence byte, then the value
 * when the byte is 1.
 */
export interface CameraInstructionData {
    /** `Set`. */
    set?: CameraSetInstruction;
    /** `Clear`: drop every active instruction. */
    clear?: boolean;
    /** `Fade`. */
    fade?: CameraFadeInstruction;
    /** `Target`. */
    target?: CameraTargetInstruction;
    /** `RemoveTarget`: stop aim assist targeting. */
    removeTarget?: boolean;
    /** `FieldOfView`. */
    fieldOfView?: CameraFovInstruction;
    /** `Spline`. */
    spline?: CameraSplineInstruction;
    /** `AttachToEntity`: the docs' `AttachToEntityInstruction`, one `Entity Actor ID` as int64 LE. */
    attachToEntity?: bigint;
    /** `DetachFromEntity`. */
    detachFromEntity?: boolean;
}

/**
 * The instruction set `CameraInstructionPacket` carries: up to nine parts the client applies
 * in order.
 *
 * Protocol 2193 wire order, each part a presence byte then its value: `Set` (`preset` uint32 LE,
 * then the optional `ease` as a uint8 type and a float LE time, `pos` Vec3, `rot` Vec2, `facing`
 * Vec3, `view_offset` Vec2, `entity_offset` Vec3 and `default` boolean, then
 * `removeIgnoreStartingValuesComponent` as a plain boolean); `Clear` boolean; `Fade` (optional
 * `Time` as three float LE, optional `Color` as three float LE); `Target` (optional
 * `Target Center Offset` Vec3, then `Target Actor ID` int64 LE); `RemoveTarget` boolean;
 * `FieldOfView` (`Field of View` and `FOV Ease Time` float LE, `FOV Ease Type` string,
 * `Field of View Clear` boolean); `Spline` (`totalTime` float LE, `type` uint8, `curve` as a
 * varuint32 count of Vec3, `progressKeyFrames` and `rotationOption` as varuint32 counts of
 * entries, optional `splineIdentifier` string, optional `loadFromJson` boolean);
 * `AttachToEntity` int64 LE; `DetachFromEntity` boolean.
 *
 * The 1.26.51 schema lists the nine parts as required, but the client reads a presence byte
 * before each (gophertunnel and PocketMine agree), and the 1.26.60 preview schema marks them
 * optional.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/types/camera-instruction/}
 */
export default class CameraInstruction extends NetworkStructure {
    /**
     * Creates an instruction. The default has no part, so the static `deserialize` can construct
     * an instance before reading the stream.
     * @param data - The parts to send.
     */
    public constructor(public data: CameraInstructionData = {}) {
        super();
    }

    private static writeSet(stream: NetworkBinaryStream, set: CameraSetInstruction): void {
        stream.writeUnsignedIntLE(set.preset);
        stream.writeOptional(set.ease, (ease) => {
            stream.writeByte(ease.type);
            stream.writeFloatLE(ease.time);
        });
        stream.writeOptional(set.position, (position) => position.serialize(stream));
        stream.writeOptional(set.rotation, (rotation) => rotation.serialize(stream));
        stream.writeOptional(set.facing, (facing) => facing.serialize(stream));
        stream.writeOptional(set.viewOffset, (offset) => offset.serialize(stream));
        stream.writeOptional(set.entityOffset, (offset) => offset.serialize(stream));
        stream.writeOptional(set.default, (isDefault) => stream.writeBoolean(isDefault));
        stream.writeBoolean(set.removeIgnoreStartingValuesComponent);
    }

    private static readSet(stream: NetworkBinaryStream): CameraSetInstruction {
        return {
            preset: stream.readUnsignedIntLE(),
            ease: stream.readOptional(() => ({ type: stream.readByte(), time: stream.readFloatLE() })),
            position: stream.readOptional(() => Vec3.deserialize(stream)),
            rotation: stream.readOptional(() => Vec2.deserialize(stream)),
            facing: stream.readOptional(() => Vec3.deserialize(stream)),
            viewOffset: stream.readOptional(() => Vec2.deserialize(stream)),
            entityOffset: stream.readOptional(() => Vec3.deserialize(stream)),
            default: stream.readOptional(() => stream.readBoolean()),
            removeIgnoreStartingValuesComponent: stream.readBoolean()
        };
    }

    private static writeFade(stream: NetworkBinaryStream, fade: CameraFadeInstruction): void {
        stream.writeOptional(fade.time, (time) => {
            stream.writeFloatLE(time.fadeInTime);
            stream.writeFloatLE(time.holdTime);
            stream.writeFloatLE(time.fadeOutTime);
        });
        stream.writeOptional(fade.color, (color) => {
            stream.writeFloatLE(color.red);
            stream.writeFloatLE(color.green);
            stream.writeFloatLE(color.blue);
        });
    }

    private static readFade(stream: NetworkBinaryStream): CameraFadeInstruction {
        return {
            time: stream.readOptional(() => ({
                fadeInTime: stream.readFloatLE(),
                holdTime: stream.readFloatLE(),
                fadeOutTime: stream.readFloatLE()
            })),
            color: stream.readOptional(() => ({
                red: stream.readFloatLE(),
                green: stream.readFloatLE(),
                blue: stream.readFloatLE()
            }))
        };
    }

    private static readEasingFunction(stream: NetworkBinaryStream): EasingFunction {
        const name = stream.readString();
        if (!isEasingFunction(name)) {
            throw new Error(`Unknown easing_function "${name}"`);
        }
        return name;
    }

    private static writeSpline(stream: NetworkBinaryStream, spline: CameraSplineInstruction): void {
        stream.writeFloatLE(spline.totalTime);
        stream.writeByte(spline.type);
        stream.writeUnsignedVarInt(spline.curve.length);
        for (const point of spline.curve) {
            point.serialize(stream);
        }
        stream.writeUnsignedVarInt(spline.progressKeyFrames.length);
        for (const frame of spline.progressKeyFrames) {
            stream.writeFloatLE(frame.value);
            stream.writeFloatLE(frame.time);
            stream.writeString(frame.easing);
        }
        stream.writeUnsignedVarInt(spline.rotationKeyFrames.length);
        for (const frame of spline.rotationKeyFrames) {
            frame.value.serialize(stream);
            stream.writeFloatLE(frame.time);
            stream.writeString(frame.easing);
        }
        stream.writeOptional(spline.splineIdentifier, (identifier) => stream.writeString(identifier));
        stream.writeOptional(spline.loadFromJson, (load) => stream.writeBoolean(load));
    }

    private static readSpline(stream: NetworkBinaryStream): CameraSplineInstruction {
        const totalTime = stream.readFloatLE();
        const type = stream.readByte();

        const curve: Vec3[] = [];
        let points = stream.readUnsignedVarInt();
        while (points-- > 0) {
            curve.push(Vec3.deserialize(stream));
        }

        const progressKeyFrames: CameraSplineProgressKeyFrame[] = [];
        let progressFrames = stream.readUnsignedVarInt();
        while (progressFrames-- > 0) {
            progressKeyFrames.push({
                value: stream.readFloatLE(),
                time: stream.readFloatLE(),
                easing: CameraInstruction.readEasingFunction(stream)
            });
        }

        const rotationKeyFrames: CameraSplineRotationKeyFrame[] = [];
        let rotationFrames = stream.readUnsignedVarInt();
        while (rotationFrames-- > 0) {
            rotationKeyFrames.push({
                value: Vec3.deserialize(stream),
                time: stream.readFloatLE(),
                easing: CameraInstruction.readEasingFunction(stream)
            });
        }

        return {
            totalTime,
            type,
            curve,
            progressKeyFrames,
            rotationKeyFrames,
            splineIdentifier: stream.readOptional(() => stream.readString()),
            loadFromJson: stream.readOptional(() => stream.readBoolean())
        };
    }

    /** Writes the nine parts in wire order, a presence byte before each. */
    public serialize(stream: NetworkBinaryStream): void {
        const instruction = this.data;
        stream.writeOptional(instruction.set, (set) => CameraInstruction.writeSet(stream, set));
        stream.writeOptional(instruction.clear, (clear) => stream.writeBoolean(clear));
        stream.writeOptional(instruction.fade, (fade) => CameraInstruction.writeFade(stream, fade));
        stream.writeOptional(instruction.target, (target) => {
            stream.writeOptional(target.targetCenterOffset, (offset) => offset.serialize(stream));
            stream.writeLongLE(target.targetActorId);
        });
        stream.writeOptional(instruction.removeTarget, (remove) => stream.writeBoolean(remove));
        stream.writeOptional(instruction.fieldOfView, (fov) => {
            stream.writeFloatLE(fov.fieldOfView);
            stream.writeFloatLE(fov.easeTime);
            stream.writeString(fov.easeType);
            stream.writeBoolean(fov.clear);
        });
        stream.writeOptional(instruction.spline, (spline) => CameraInstruction.writeSpline(stream, spline));
        stream.writeOptional(instruction.attachToEntity, (actorId) => stream.writeLongLE(actorId));
        stream.writeOptional(instruction.detachFromEntity, (detach) => stream.writeBoolean(detach));
    }

    /**
     * Reads the nine parts in wire order. An absent part is left undefined.
     * @throws Error when an `easing_function` string is not one of the docs' names.
     */
    public deserialize(stream: NetworkBinaryStream): void {
        this.data = {
            set: stream.readOptional(() => CameraInstruction.readSet(stream)),
            clear: stream.readOptional(() => stream.readBoolean()),
            fade: stream.readOptional(() => CameraInstruction.readFade(stream)),
            target: stream.readOptional(() => ({
                targetCenterOffset: stream.readOptional(() => Vec3.deserialize(stream)),
                targetActorId: stream.readLongLE()
            })),
            removeTarget: stream.readOptional(() => stream.readBoolean()),
            fieldOfView: stream.readOptional(() => ({
                fieldOfView: stream.readFloatLE(),
                easeTime: stream.readFloatLE(),
                easeType: CameraInstruction.readEasingFunction(stream),
                clear: stream.readBoolean()
            })),
            spline: stream.readOptional(() => CameraInstruction.readSpline(stream)),
            attachToEntity: stream.readOptional(() => stream.readLongLE()),
            detachFromEntity: stream.readOptional(() => stream.readBoolean())
        };
    }
}
