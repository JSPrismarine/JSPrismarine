import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/**
 * `GraphicsOverrideParameterType`: which rendering parameter a `GraphicsOverrideParameterPacket`
 * sets, written as a uint8 with these values. Mojang's enum dump and gophertunnel agree on
 * the numbering.
 */
export enum GraphicsOverrideParameterType {
    /** Docs: `SkyZenithColor`. */
    SKY_ZENITH_COLOR = 0,
    /** Docs: `SkyHorizonColor`. */
    SKY_HORIZON_COLOR = 1,
    /** Docs: `HorizonBlendMin`. */
    HORIZON_BLEND_MIN = 2,
    /** Docs: `HorizonBlendMax`. */
    HORIZON_BLEND_MAX = 3,
    /** Docs: `HorizonBlendStart`. */
    HORIZON_BLEND_START = 4,
    /** Docs: `HorizonBlendMieStart`. */
    HORIZON_BLEND_MIE_START = 5,
    /** Docs: `RayleighStrength`. */
    RAYLEIGH_STRENGTH = 6,
    /** Docs: `SunMieStrength`. */
    SUN_MIE_STRENGTH = 7,
    /** Docs: `MoonMieStrength`. */
    MOON_MIE_STRENGTH = 8,
    /** Docs: `SunGlareShape`. */
    SUN_GLARE_SHAPE = 9,
    /** Docs: `Chlorophyll`, a water parameter. */
    CHLOROPHYLL = 10,
    /** Docs: `CDOM`, the water's colored dissolved organic matter. */
    CDOM = 11,
    /** Docs: `SuspendedSediment`, a water parameter. */
    SUSPENDED_SEDIMENT = 12,
    /** Docs: `WavesDepth`. */
    WAVES_DEPTH = 13,
    /** Docs: `WavesFrequency`. */
    WAVES_FREQUENCY = 14,
    /** Docs: `WavesFrequencyScaling`. */
    WAVES_FREQUENCY_SCALING = 15,
    /** Docs: `WavesSpeed`. */
    WAVES_SPEED = 16,
    /** Docs: `WavesSpeedScaling`. */
    WAVES_SPEED_SCALING = 17,
    /** Docs: `WavesShape`. */
    WAVES_SHAPE = 18,
    /** Docs: `WavesOctaves`. */
    WAVES_OCTAVES = 19,
    /** Docs: `WavesMix`. */
    WAVES_MIX = 20,
    /** Docs: `WavesPull`. */
    WAVES_PULL = 21,
    /** Docs: `WavesDirectionIncrement`. */
    WAVES_DIRECTION_INCREMENT = 22,
    /** Docs: `MidtonesContrast`, color grading. */
    MIDTONES_CONTRAST = 23,
    /** Docs: `HighlightsContrast`, color grading. */
    HIGHLIGHTS_CONTRAST = 24,
    /** Docs: `ShadowsContrast`, color grading. */
    SHADOWS_CONTRAST = 25,
    /** Docs: `HighlightsGain`, color grading. */
    HIGHLIGHTS_GAIN = 26,
    /** Docs: `HighlightsGamma`, color grading. */
    HIGHLIGHTS_GAMMA = 27,
    /** Docs: `HighlightsOffset`, color grading. */
    HIGHLIGHTS_OFFSET = 28,
    /** Docs: `HighlightsSaturation`, color grading. */
    HIGHLIGHTS_SATURATION = 29,
    /** Docs: `MidtonesGain`, color grading. */
    MIDTONES_GAIN = 30,
    /** Docs: `MidtonesGamma`, color grading. */
    MIDTONES_GAMMA = 31,
    /** Docs: `MidtonesOffset`, color grading. */
    MIDTONES_OFFSET = 32,
    /** Docs: `MidtonesSaturation`, color grading. */
    MIDTONES_SATURATION = 33,
    /** Docs: `ShadowsGain`, color grading. */
    SHADOWS_GAIN = 34,
    /** Docs: `ShadowsGamma`, color grading. */
    SHADOWS_GAMMA = 35,
    /** Docs: `ShadowsOffset`, color grading. */
    SHADOWS_OFFSET = 36,
    /** Docs: `ShadowsSaturation`, color grading. */
    SHADOWS_SATURATION = 37,
    /** Docs: `HighlightsMin`, color grading. */
    HIGHLIGHTS_MIN = 38,
    /** Docs: `ShadowsMax`, color grading. */
    SHADOWS_MAX = 39,
    /** Docs: `Temperature`, color grading. */
    TEMPERATURE = 40,
    /** Docs: `SunColor`, lighting. */
    SUN_COLOR = 41,
    /** Docs: `SunIlluminance`, lighting. */
    SUN_ILLUMINANCE = 42,
    /** Docs: `MoonColor`, lighting. */
    MOON_COLOR = 43,
    /** Docs: `MoonIlluminance`, lighting. */
    MOON_ILLUMINANCE = 44,
    /** Docs: `FlashColor`, lighting. */
    FLASH_COLOR = 45,
    /** Docs: `FlashIlluminance`, lighting. */
    FLASH_ILLUMINANCE = 46,
    /** Docs: `AmbientColor`, lighting. */
    AMBIENT_COLOR = 47,
    /** Docs: `AmbientIlluminance`, lighting. */
    AMBIENT_ILLUMINANCE = 48,
    /** Docs: `EmissiveDesaturation`, lighting. */
    EMISSIVE_DESATURATION = 49,
    /** Docs: `SkyIntensity`, lighting. */
    SKY_INTENSITY = 50,
    /** Docs: `OrbitalOffsetDegrees`, lighting. */
    ORBITAL_OFFSET_DEGREES = 51
}

/** Three little-endian floats, the docs' `Vec3`. */
export interface GraphicsVec3 {
    /** `X`. */
    x: number;
    /** `Y`. */
    y: number;
    /** `Z`. */
    z: number;
}

/** One entry of `Parameter Keyframe Values`: a time of day and the parameter's value then. */
export interface ParameterKeyframeValue {
    /** The map key, a time of day as a little-endian float. */
    time: number;
    /**
     * The value at that time. A color parameter uses all three components; a float, int, or
     * bool parameter uses `x` alone.
     */
    value: GraphicsVec3;
}

/** The fields of a `GraphicsOverrideParameterPacket`, in wire order. */
export interface GraphicsOverrideParameter {
    /** `Parameter Keyframe Values`, at most 255 entries. Empty when the override is a single value. */
    keyframeValues: ParameterKeyframeValue[];
    /** `Float Value`: a single float override. Omit when the parameter is keyframed or a Vec3. */
    floatValue?: number;
    /** `Vec3 Value`: a single Vec3 override. Omit when the parameter is keyframed or a float. */
    vec3Value?: GraphicsVec3;
    /** `Biome Identifier`: the biome the override applies to. */
    biomeIdentifier: string;
    /** `Player Identifier`: the player the override applies to. Omit for every player. */
    playerIdentifier?: string;
    /** `Identifier for Parameter`: which parameter changes. */
    parameter: GraphicsOverrideParameterType;
    /** `Reset Parameter`: when true the parameter returns to its default and the value fields are ignored. */
    resetParameter: boolean;
}

/**
 * A rendering parameter a server script overrides for a biome, optionally for one player.
 *
 * Protocol 2193 layout, in wire order: `Parameter Keyframe Values` as a varuint32 count then
 * per entry the time as a little-endian float and the value as three little-endian floats;
 * `Float Value` as a presence byte then a little-endian float; `Vec3 Value` as a presence
 * byte then three little-endian floats; `Biome Identifier` as a string; `Player Identifier`
 * as a presence byte then a string; `Identifier for Parameter` as a uint8 with the values of
 * {@link GraphicsOverrideParameterType}; `Reset Parameter` as one byte. Strings are a
 * varuint32 byte length followed by UTF-8.
 *
 * The 1.26.51 schema marks `Float Value` and `Vec3 Value` required, and the 1.26.60-preview.21
 * changelog says they "are now optional" with no release note of a wire change. gophertunnel
 * (protocol 2193) and PocketMine (protocol 1001) both read them with a presence byte, so this
 * class does too. `Player Identifier` arrived at 1.26.20 for per-player overrides.
 *
 * Only a script's `BiomeGraphicsOverride` API produces this packet; the server has nothing
 * to send in it today.
 */
export default class GraphicsOverrideParameterPacket extends NetworkPacket<GraphicsOverrideParameter> {
    public get id(): number {
        return PacketIdentifier.GRAPHICS_OVERRIDE_PARAMETER;
    }

    private static writeVec3(stream: NetworkBinaryStream, value: GraphicsVec3): void {
        stream.writeFloatLE(value.x);
        stream.writeFloatLE(value.y);
        stream.writeFloatLE(value.z);
    }

    private static readVec3(stream: NetworkBinaryStream): GraphicsVec3 {
        return { x: stream.readFloatLE(), y: stream.readFloatLE(), z: stream.readFloatLE() };
    }

    protected serializePayload(stream: NetworkBinaryStream, data: GraphicsOverrideParameter): void {
        stream.writeUnsignedVarInt(data.keyframeValues.length);
        for (const keyframe of data.keyframeValues) {
            stream.writeFloatLE(keyframe.time);
            GraphicsOverrideParameterPacket.writeVec3(stream, keyframe.value);
        }

        stream.writeBoolean(data.floatValue !== undefined);
        if (data.floatValue !== undefined) {
            stream.writeFloatLE(data.floatValue);
        }

        stream.writeBoolean(data.vec3Value !== undefined);
        if (data.vec3Value !== undefined) {
            GraphicsOverrideParameterPacket.writeVec3(stream, data.vec3Value);
        }

        stream.writeString(data.biomeIdentifier);

        stream.writeBoolean(data.playerIdentifier !== undefined);
        if (data.playerIdentifier !== undefined) {
            stream.writeString(data.playerIdentifier);
        }

        stream.writeByte(data.parameter);
        stream.writeBoolean(data.resetParameter);
    }

    protected deserializePayload(stream: NetworkBinaryStream): GraphicsOverrideParameter {
        const keyframeValues: ParameterKeyframeValue[] = [];
        let count = stream.readUnsignedVarInt();
        while (count-- > 0) {
            keyframeValues.push({
                time: stream.readFloatLE(),
                value: GraphicsOverrideParameterPacket.readVec3(stream)
            });
        }

        const floatValue = stream.readBoolean() ? stream.readFloatLE() : undefined;
        const vec3Value = stream.readBoolean() ? GraphicsOverrideParameterPacket.readVec3(stream) : undefined;
        const biomeIdentifier = stream.readString();
        const playerIdentifier = stream.readBoolean() ? stream.readString() : undefined;
        const parameter: GraphicsOverrideParameterType = stream.readByte();
        const resetParameter = stream.readBoolean();

        return {
            keyframeValues,
            ...(floatValue !== undefined && { floatValue }),
            ...(vec3Value !== undefined && { vec3Value }),
            biomeIdentifier,
            ...(playerIdentifier !== undefined && { playerIdentifier }),
            parameter,
            resetParameter
        };
    }
}
