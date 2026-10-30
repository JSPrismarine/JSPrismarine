import NetworkStructure from '../NetworkStructure';
import { string as stringType } from '../wire/fieldTypes';
import Vec2 from './Vec2';
import Vec3 from './Vec3';

import type BinaryStream from '@jsprismarine/binaryutils';

/**
 * Reads one `Vec2` off the stream. `NetworkStructure`'s static `deserialize` asks for a
 * `NetworkBinaryStream`, which this module's widened codecs no longer carry.
 * @param stream - The stream positioned at the vector's first float.
 * @returns The read vector.
 */
const readVec2 = (stream: BinaryStream): Vec2 => {
    const vector = new Vec2(0, 0);
    vector.deserialize(stream);
    return vector;
};

/**
 * Reads one `Vec3` off the stream; see {@link readVec2} for why the static is not used.
 * @param stream - The stream positioned at the vector's first float.
 * @returns The read vector.
 */
const readVec3 = (stream: BinaryStream): Vec3 => {
    const vector = new Vec3(0, 0, 0);
    vector.deserialize(stream);
    return vector;
};

/**
 * Reads a `brstd::optional<T>`: a presence boolean, then the value when the boolean is 1.
 * `NetworkBinaryStream.readOptional` widened to the base stream, so the wire layout bridge
 * can run over any `BinaryStream`.
 * @param stream - The stream positioned at the presence byte.
 * @param read - Reads the value once the presence byte says it is there.
 * @returns The value, or undefined when the presence byte is 0.
 */
const readOptional = <T>(stream: BinaryStream, read: () => T): T | undefined =>
    stream.readBoolean() ? read() : undefined;

/**
 * Writes a `brstd::optional<T>`: a presence boolean, then the value when it is defined.
 * @param stream - The stream to append to.
 * @param value - The value, or undefined to write a single 0 byte.
 * @param write - Writes the value after the presence byte.
 */
const writeOptional = <T>(stream: BinaryStream, value: T | undefined, write: (value: T) => void): void => {
    stream.writeBoolean(value !== undefined);
    if (value !== undefined) {
        write(value);
    }
};

/** The docs' `SharedTypes::Comprehensive::CameraPreset::AudioListener`: where the preset hears sound from. */
export enum CameraAudioListener {
    CAMERA = 0,
    PLAYER = 1
}

/** The docs' `Aim-Assist Target Mode`: how aim assist picks a target near the cursor. */
export enum AimAssistTargetMode {
    /** Any target inside the `View Angle` cone. */
    ANGLE = 0,
    /** Any target within `Distance` of the cursor. */
    DISTANCE = 1
}

/** The docs' `Control Scheme`: how movement input maps to the player while the preset is active. */
export enum ControlScheme {
    /** The default scheme. The client rejects it inside a custom camera. */
    LOCKED_PLAYER_RELATIVE_STRAFE = 0,
    CAMERA_RELATIVE = 1,
    CAMERA_RELATIVE_STRAFE = 2,
    PLAYER_RELATIVE = 3,
    PLAYER_RELATIVE_STRAFE = 4
}

/**
 * A preset's `Aim Assist`, the docs' `SharedTypes::Comprehensive::CameraAimAssistCommandDefinition`.
 * Each field is a presence byte, then the value when the byte is 1.
 */
export interface CameraAimAssistDefinition {
    /** `Preset Id`, the name of an aim assist preset from `CameraAimAssistPresetsPacket`. */
    presetId?: string;
    /** `Target Mode`, a uint8. */
    targetMode?: AimAssistTargetMode;
    /** `View Angle`, the cone around the cursor searched in `ANGLE` mode. */
    viewAngle?: Vec2;
    /** `Distance`, the reach from the cursor searched in `DISTANCE` mode. */
    distance?: number;
}

/**
 * The fields of a `CameraPresets` entry, in wire order. A field marked optional is a presence
 * byte, then the value when the byte is 1.
 */
export interface CameraPresetData {
    /** `Name`: the identifier presets inherit by, and that `CameraInstructionPacket` selects by list index. */
    name: string;
    /** `Inherit From`: the parent preset's name, or empty for a root preset. */
    inheritFrom: string;
    /** `Pos X`, optional. */
    posX?: number;
    /** `Pos Y`, optional. */
    posY?: number;
    /** `Pos Z`, optional. */
    posZ?: number;
    /** `Rot X`, the pitch in degrees, optional. */
    rotX?: number;
    /** `Rot Y`, the yaw in degrees, optional. */
    rotY?: number;
    /** `Rotation Speed`, optional. */
    rotationSpeed?: number;
    /** `Snap to Target`, optional. */
    snapToTarget?: boolean;
    /** `Horizontal Rotation Limit`, optional. */
    horizontalRotationLimit?: Vec2;
    /** `Vertical Rotation Limit`, optional. */
    verticalRotationLimit?: Vec2;
    /** `Continue Targeting`, optional: keep the aim assist target while it moves. */
    continueTargeting?: boolean;
    /** `Block Listening Radius`, optional: how far around the camera aim assist considers blocks. */
    blockListeningRadius?: number;
    /** `View Offset`, optional: shifts the camera from its pivot point on the player. */
    viewOffset?: Vec2;
    /** `Entity Offset`, optional: moves the pivot point away from the entity's center. */
    entityOffset?: Vec3;
    /** `Radius`, optional: how far an orbit camera sits from the player. */
    radius?: number;
    /** `Yaw Limit Min`, optional. */
    yawLimitMin?: number;
    /** `Yaw Limit Max`, optional. */
    yawLimitMax?: number;
    /** `Listener`, optional, a uint8. */
    listener?: CameraAudioListener;
    /** `Player Effects`, optional: whether the player's status effects render in this camera. */
    playerEffects?: boolean;
    /** `Aim Assist`, optional. */
    aimAssist?: CameraAimAssistDefinition;
    /** `Control Scheme`, optional, a uint8. */
    controlScheme?: ControlScheme;
    /** `Apply Inherited Starting Rotation`: start at the parent's rotation instead of `Starting Rotation`. */
    applyInheritedStartingRotation: boolean;
    /** `Starting Rotation`, optional: the rotation the camera starts at when the preset applies. */
    startingRotation?: Vec2;
}

/**
 * One camera preset, the docs' `CameraPresets` type, as `CameraPresetsPacket` lists them.
 *
 * Protocol 2193 wire order: `Name` and `Inherit From` as strings (a varuint32 byte length, then
 * UTF-8), then fields 2 to 21 each as a presence byte followed by the value when the byte is 1:
 * `Pos X`, `Pos Y`, `Pos Z`, `Rot X`, `Rot Y` and `Rotation Speed` as float LE; `Snap to Target`
 * as a boolean; `Horizontal Rotation Limit` and `Vertical Rotation Limit` as Vec2;
 * `Continue Targeting` as a boolean; `Block Listening Radius` as float LE; `View Offset` as Vec2;
 * `Entity Offset` as Vec3; `Radius`, `Yaw Limit Min` and `Yaw Limit Max` as float LE; `Listener`
 * as a uint8; `Player Effects` as a boolean; `Aim Assist` as its own four optional fields
 * (`Preset Id` string, `Target Mode` uint8, `View Angle` Vec2, `Distance` float LE);
 * `Control Scheme` as a uint8. Then `Apply Inherited Starting Rotation` as a boolean with no
 * presence byte, and `Starting Rotation` as an optional Vec2.
 *
 * The 1.26.51 schema lists every field as required, but the client reads a presence byte before
 * each of the fields above (gophertunnel and PocketMine agree), and the 1.26.60 preview schema
 * marks the same fields optional.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/types/camera-presets/}
 */
export default class CameraPreset extends NetworkStructure {
    /**
     * Creates a preset. The default is an unnamed root preset with no optional field, so the
     * static `deserialize` can construct an instance before reading the stream.
     * @param data - The preset's fields.
     */
    public constructor(
        public data: CameraPresetData = { name: '', inheritFrom: '', applyInheritedStartingRotation: false }
    ) {
        super();
    }

    private static writeAimAssist(stream: BinaryStream, aimAssist: CameraAimAssistDefinition): void {
        writeOptional(stream, aimAssist.presetId, (id) => stringType.write(stream, id));
        writeOptional(stream, aimAssist.targetMode, (mode) => stream.writeByte(mode));
        writeOptional(stream, aimAssist.viewAngle, (angle) => angle.serialize(stream));
        writeOptional(stream, aimAssist.distance, (distance) => stream.writeFloatLE(distance));
    }

    private static readAimAssist(stream: BinaryStream): CameraAimAssistDefinition {
        return {
            presetId: readOptional(stream, () => stringType.read(stream)),
            targetMode: readOptional(stream, () => stream.readByte()),
            viewAngle: readOptional(stream, () => readVec2(stream)),
            distance: readOptional(stream, () => stream.readFloatLE())
        };
    }

    /** Writes the preset in wire order, one presence byte per optional field. */
    public serialize(stream: BinaryStream): void {
        const preset = this.data;
        const writeFloat = (value: number) => stream.writeFloatLE(value);
        const writeBoolean = (value: boolean) => stream.writeBoolean(value);
        const writeVector = (value: Vec2) => value.serialize(stream);

        stringType.write(stream, preset.name);
        stringType.write(stream, preset.inheritFrom);
        writeOptional(stream, preset.posX, writeFloat);
        writeOptional(stream, preset.posY, writeFloat);
        writeOptional(stream, preset.posZ, writeFloat);
        writeOptional(stream, preset.rotX, writeFloat);
        writeOptional(stream, preset.rotY, writeFloat);
        writeOptional(stream, preset.rotationSpeed, writeFloat);
        writeOptional(stream, preset.snapToTarget, writeBoolean);
        writeOptional(stream, preset.horizontalRotationLimit, writeVector);
        writeOptional(stream, preset.verticalRotationLimit, writeVector);
        writeOptional(stream, preset.continueTargeting, writeBoolean);
        writeOptional(stream, preset.blockListeningRadius, writeFloat);
        writeOptional(stream, preset.viewOffset, writeVector);
        writeOptional(stream, preset.entityOffset, writeVector);
        writeOptional(stream, preset.radius, writeFloat);
        writeOptional(stream, preset.yawLimitMin, writeFloat);
        writeOptional(stream, preset.yawLimitMax, writeFloat);
        writeOptional(stream, preset.listener, (listener) => stream.writeByte(listener));
        writeOptional(stream, preset.playerEffects, writeBoolean);
        writeOptional(stream, preset.aimAssist, (aimAssist) => CameraPreset.writeAimAssist(stream, aimAssist));
        writeOptional(stream, preset.controlScheme, (scheme) => stream.writeByte(scheme));
        stream.writeBoolean(preset.applyInheritedStartingRotation);
        writeOptional(stream, preset.startingRotation, writeVector);
    }

    /** Reads the preset in wire order. An absent optional field is left undefined. */
    public deserialize(stream: BinaryStream): void {
        const readFloat = () => stream.readFloatLE();
        const readBoolean = () => stream.readBoolean();
        const readVector2 = () => readVec2(stream);
        const readVector3 = () => readVec3(stream);

        this.data = {
            name: stringType.read(stream),
            inheritFrom: stringType.read(stream),
            posX: readOptional(stream, readFloat),
            posY: readOptional(stream, readFloat),
            posZ: readOptional(stream, readFloat),
            rotX: readOptional(stream, readFloat),
            rotY: readOptional(stream, readFloat),
            rotationSpeed: readOptional(stream, readFloat),
            snapToTarget: readOptional(stream, readBoolean),
            horizontalRotationLimit: readOptional(stream, readVector2),
            verticalRotationLimit: readOptional(stream, readVector2),
            continueTargeting: readOptional(stream, readBoolean),
            blockListeningRadius: readOptional(stream, readFloat),
            viewOffset: readOptional(stream, readVector2),
            entityOffset: readOptional(stream, readVector3),
            radius: readOptional(stream, readFloat),
            yawLimitMin: readOptional(stream, readFloat),
            yawLimitMax: readOptional(stream, readFloat),
            listener: readOptional(stream, () => stream.readByte()),
            playerEffects: readOptional(stream, readBoolean),
            aimAssist: readOptional(stream, () => CameraPreset.readAimAssist(stream)),
            controlScheme: readOptional(stream, () => stream.readByte()),
            applyInheritedStartingRotation: stream.readBoolean(),
            startingRotation: readOptional(stream, readVector2)
        };
    }
}
