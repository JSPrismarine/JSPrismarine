import NetworkStructure from '../NetworkStructure';
import { isEasingFunction } from './CameraInstruction';
import Vec3 from './Vec3';

import type NetworkBinaryStream from '../NetworkBinaryStream';
import type { EasingFunction } from './CameraInstruction';

/** The `spline_type` names: how the camera interpolates between control points. */
export enum CameraSplineType {
    CatmullRom = 'catmullrom',
    Linear = 'linear'
}

/** One `CameraSplineProgressKeyFrame` of a definition: how far along the spline the camera is at a given time. */
export interface SplineDefinitionProgressKeyFrame {
    /** `progress` along the spline, 0 at the start and 1 at the end. */
    progress: number;
    /** `time` in seconds at which the camera reaches `progress`. */
    time: number;
    /** `easing` towards this frame, an `easing_function` name. Linear when omitted. */
    easing?: EasingFunction;
}

/** One `CameraSplineRotationKeyFrame` of a definition: the camera rotation at a given time. */
export interface SplineDefinitionRotationKeyFrame {
    /** `rotation` as x, y and z angles. */
    rotation: Vec3;
    /** `time` in seconds at which the camera reaches `rotation`. */
    time: number;
    /** `easing` towards this frame, an `easing_function` name. Linear when omitted. */
    easing?: EasingFunction;
}

/**
 * A `CameraSplineDefinition`: a named camera path a behavior pack defines and `/camera` plays
 * back by name, as `CameraSplinePacket` lists them.
 *
 * Protocol 2193 wire order:
 * 0. `name`: string, "namespace:name".
 * 1. `total_time`: little-endian float, the playback length in seconds.
 * 2. `spline_type`: optional. A presence byte, then a {@link CameraSplineType} string when
 *    present. Catmull-Rom when absent.
 * 3. `control_points`: varuint32 count, then one `position` {@link Vec3} per point, three
 *    little-endian floats.
 * 4. `progress_key_frames`: varuint32 count, then per frame `progress` and `time` as floats and
 *    `easing` as an optional string.
 * 5. `rotation_key_frames`: varuint32 count, then per frame `rotation` as a {@link Vec3}, `time`
 *    as a float and `easing` as an optional string.
 *
 * Strings are a varuint32 byte length followed by UTF-8. The schema lists `spline_type` and
 * both `easing` fields outside `required`, so each carries a presence byte. The key frames of
 * `CameraInstructionPacket` differ: their easing is required and written bare.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/types/camera-spline-definition/}
 */
export default class CameraSplineDefinition extends NetworkStructure {
    /**
     * Creates a definition. Every parameter has a default so the static `deserialize` can
     * construct an instance before reading the stream.
     * @param name - `name`, the namespaced spline identifier.
     * @param totalTime - `total_time` in seconds.
     * @param splineType - `spline_type`. Omitted when undefined, which the client reads as Catmull-Rom.
     * @param controlPoints - `control_points`, the positions the path passes through, in order.
     * @param progressKeyFrames - `progress_key_frames`, when the camera reaches each point of the path.
     * @param rotationKeyFrames - `rotation_key_frames`, the camera rotation over time.
     */
    public constructor(
        public name = '',
        public totalTime = 0,
        public splineType?: string,
        public controlPoints: Vec3[] = [],
        public progressKeyFrames: SplineDefinitionProgressKeyFrame[] = [],
        public rotationKeyFrames: SplineDefinitionRotationKeyFrame[] = []
    ) {
        super();
    }

    private static writeOptionalString(stream: NetworkBinaryStream, value: string | undefined): void {
        stream.writeBoolean(value !== undefined);
        if (value !== undefined) {
            stream.writeString(value);
        }
    }

    private static readOptionalString(stream: NetworkBinaryStream): string | undefined {
        return stream.readBoolean() ? stream.readString() : undefined;
    }

    private static readOptionalEasing(stream: NetworkBinaryStream): EasingFunction | undefined {
        const name = CameraSplineDefinition.readOptionalString(stream);
        if (name === undefined) {
            return undefined;
        }
        if (!isEasingFunction(name)) {
            throw new Error(`Unknown easing_function "${name}"`);
        }
        return name;
    }

    /** Writes the six fields in wire order. */
    public serialize(stream: NetworkBinaryStream): void {
        stream.writeString(this.name);
        stream.writeFloatLE(this.totalTime);
        CameraSplineDefinition.writeOptionalString(stream, this.splineType);

        stream.writeUnsignedVarInt(this.controlPoints.length);
        for (const point of this.controlPoints) {
            point.serialize(stream);
        }

        stream.writeUnsignedVarInt(this.progressKeyFrames.length);
        for (const frame of this.progressKeyFrames) {
            stream.writeFloatLE(frame.progress);
            stream.writeFloatLE(frame.time);
            CameraSplineDefinition.writeOptionalString(stream, frame.easing);
        }

        stream.writeUnsignedVarInt(this.rotationKeyFrames.length);
        for (const frame of this.rotationKeyFrames) {
            frame.rotation.serialize(stream);
            stream.writeFloatLE(frame.time);
            CameraSplineDefinition.writeOptionalString(stream, frame.easing);
        }
    }

    /**
     * Reads the six fields in wire order.
     * @throws Error when a present `easing` string is not one of the docs' `easing_function` names.
     */
    public deserialize(stream: NetworkBinaryStream): void {
        this.name = stream.readString();
        this.totalTime = stream.readFloatLE();
        this.splineType = CameraSplineDefinition.readOptionalString(stream);

        const controlPoints: Vec3[] = [];
        let count = stream.readUnsignedVarInt();
        while (count-- > 0) {
            controlPoints.push(Vec3.deserialize(stream));
        }
        this.controlPoints = controlPoints;

        const progressKeyFrames: SplineDefinitionProgressKeyFrame[] = [];
        count = stream.readUnsignedVarInt();
        while (count-- > 0) {
            const frame: SplineDefinitionProgressKeyFrame = {
                progress: stream.readFloatLE(),
                time: stream.readFloatLE()
            };
            const easing = CameraSplineDefinition.readOptionalEasing(stream);
            if (easing !== undefined) {
                frame.easing = easing;
            }
            progressKeyFrames.push(frame);
        }
        this.progressKeyFrames = progressKeyFrames;

        const rotationKeyFrames: SplineDefinitionRotationKeyFrame[] = [];
        count = stream.readUnsignedVarInt();
        while (count-- > 0) {
            const frame: SplineDefinitionRotationKeyFrame = {
                rotation: Vec3.deserialize(stream),
                time: stream.readFloatLE()
            };
            const easing = CameraSplineDefinition.readOptionalEasing(stream);
            if (easing !== undefined) {
                frame.easing = easing;
            }
            rotationKeyFrames.push(frame);
        }
        this.rotationKeyFrames = rotationKeyFrames;
    }
}
