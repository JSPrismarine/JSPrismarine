import type { NetworkBinaryStream } from '../';
import NetworkStructure from '../NetworkStructure';
import Vec2 from './Vec2';
import Vec3 from './Vec3';

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

    private static writeAimAssist(stream: NetworkBinaryStream, aimAssist: CameraAimAssistDefinition): void {
        stream.writeOptional(aimAssist.presetId, (id) => stream.writeString(id));
        stream.writeOptional(aimAssist.targetMode, (mode) => stream.writeByte(mode));
        stream.writeOptional(aimAssist.viewAngle, (angle) => angle.serialize(stream));
        stream.writeOptional(aimAssist.distance, (distance) => stream.writeFloatLE(distance));
    }

    private static readAimAssist(stream: NetworkBinaryStream): CameraAimAssistDefinition {
        return {
            presetId: stream.readOptional(() => stream.readString()),
            targetMode: stream.readOptional(() => stream.readByte()),
            viewAngle: stream.readOptional(() => Vec2.deserialize(stream)),
            distance: stream.readOptional(() => stream.readFloatLE())
        };
    }

    /** Writes the preset in wire order, one presence byte per optional field. */
    public serialize(stream: NetworkBinaryStream): void {
        const preset = this.data;
        const writeFloat = (value: number) => stream.writeFloatLE(value);
        const writeBoolean = (value: boolean) => stream.writeBoolean(value);
        const writeVector = (value: Vec2) => value.serialize(stream);

        stream.writeString(preset.name);
        stream.writeString(preset.inheritFrom);
        stream.writeOptional(preset.posX, writeFloat);
        stream.writeOptional(preset.posY, writeFloat);
        stream.writeOptional(preset.posZ, writeFloat);
        stream.writeOptional(preset.rotX, writeFloat);
        stream.writeOptional(preset.rotY, writeFloat);
        stream.writeOptional(preset.rotationSpeed, writeFloat);
        stream.writeOptional(preset.snapToTarget, writeBoolean);
        stream.writeOptional(preset.horizontalRotationLimit, writeVector);
        stream.writeOptional(preset.verticalRotationLimit, writeVector);
        stream.writeOptional(preset.continueTargeting, writeBoolean);
        stream.writeOptional(preset.blockListeningRadius, writeFloat);
        stream.writeOptional(preset.viewOffset, writeVector);
        stream.writeOptional(preset.entityOffset, writeVector);
        stream.writeOptional(preset.radius, writeFloat);
        stream.writeOptional(preset.yawLimitMin, writeFloat);
        stream.writeOptional(preset.yawLimitMax, writeFloat);
        stream.writeOptional(preset.listener, (listener) => stream.writeByte(listener));
        stream.writeOptional(preset.playerEffects, writeBoolean);
        stream.writeOptional(preset.aimAssist, (aimAssist) => CameraPreset.writeAimAssist(stream, aimAssist));
        stream.writeOptional(preset.controlScheme, (scheme) => stream.writeByte(scheme));
        stream.writeBoolean(preset.applyInheritedStartingRotation);
        stream.writeOptional(preset.startingRotation, writeVector);
    }

    /** Reads the preset in wire order. An absent optional field is left undefined. */
    public deserialize(stream: NetworkBinaryStream): void {
        const readFloat = () => stream.readFloatLE();
        const readBoolean = () => stream.readBoolean();
        const readVec2 = () => Vec2.deserialize(stream);
        const readVec3 = () => Vec3.deserialize(stream);

        this.data = {
            name: stream.readString(),
            inheritFrom: stream.readString(),
            posX: stream.readOptional(readFloat),
            posY: stream.readOptional(readFloat),
            posZ: stream.readOptional(readFloat),
            rotX: stream.readOptional(readFloat),
            rotY: stream.readOptional(readFloat),
            rotationSpeed: stream.readOptional(readFloat),
            snapToTarget: stream.readOptional(readBoolean),
            horizontalRotationLimit: stream.readOptional(readVec2),
            verticalRotationLimit: stream.readOptional(readVec2),
            continueTargeting: stream.readOptional(readBoolean),
            blockListeningRadius: stream.readOptional(readFloat),
            viewOffset: stream.readOptional(readVec2),
            entityOffset: stream.readOptional(readVec3),
            radius: stream.readOptional(readFloat),
            yawLimitMin: stream.readOptional(readFloat),
            yawLimitMax: stream.readOptional(readFloat),
            listener: stream.readOptional(() => stream.readByte()),
            playerEffects: stream.readOptional(readBoolean),
            aimAssist: stream.readOptional(() => CameraPreset.readAimAssist(stream)),
            controlScheme: stream.readOptional(() => stream.readByte()),
            applyInheritedStartingRotation: stream.readBoolean(),
            startingRotation: stream.readOptional(readVec2)
        };
    }
}
