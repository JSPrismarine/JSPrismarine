import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { graphicsOverrideParameterPacket } from '../wire/definitions/graphicsOverrideParameter';
import { layoutAt } from '../wire/WireLayout';

import type NetworkBinaryStream from '../NetworkBinaryStream';
import type { GraphicsOverrideParameterPayload } from '../wire/definitions/graphicsOverrideParameter';
import type { Vec3Like } from '../wire/fieldTypes';

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
export type GraphicsVec3 = Vec3Like;

/** One entry of `Parameter Keyframe Values`: a time of day and the parameter's value then. */
export type ParameterKeyframeValue = GraphicsOverrideParameter['keyframeValues'][number];

/** The fields of a `GraphicsOverrideParameterPacket`, in wire order. */
export type GraphicsOverrideParameter = GraphicsOverrideParameterPayload;

/**
 * A rendering parameter a server script overrides for a biome, optionally for one player.
 *
 * Layout at protocols 2193 and 2225, in wire order: `Parameter Keyframe Values` as a varuint32
 * count then per entry the time as a little-endian float and the value as three little-endian floats;
 * `Float Value` as a presence byte then a little-endian float; `Vec3 Value` as a presence
 * byte then three little-endian floats; `Biome Identifier` as a string; `Player Identifier`
 * as a presence byte then a string; `Identifier for Parameter` as a uint8 with the values of
 * {@link GraphicsOverrideParameterType}; `Reset Parameter` as one byte. Strings are a
 * varuint32 byte length followed by UTF-8.
 *
 * The 1.26.50 page prints `Float Value` and `Vec3 Value` plain and the 1.26.60 page marks them
 * optional, with a changelog row saying they "are now optional". Mojang's note for that build
 * calls such rows a documentation correction, so both protocols write the presence byte (see
 * `docs/research/protocol-2225-delta.md`). `Player Identifier` is optional on both pages.
 *
 * Only a script's `BiomeGraphicsOverride` API produces this packet; the server has nothing
 * to send in it today.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/graphics-override-parameter-packet/
 */
export default class GraphicsOverrideParameterPacket extends NetworkPacket<GraphicsOverrideParameter> {
    public get id(): number {
        return PacketIdentifier.GRAPHICS_OVERRIDE_PARAMETER;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: GraphicsOverrideParameter): void {
        layoutAt(graphicsOverrideParameterPacket, this.codecProtocol).encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): GraphicsOverrideParameter {
        return layoutAt(graphicsOverrideParameterPacket, this.codecProtocol).decode(stream);
    }
}
