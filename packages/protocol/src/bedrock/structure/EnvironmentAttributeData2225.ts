import NetworkStructure from '../../NetworkStructure';
import { EasingType } from './CameraInstruction';
import {
    AttributeDataType,
    BoolAttributeOperation,
    readAttributeValue,
    writeAttributeValue
} from './EnvironmentAttributeData';
import NoiseAlignment from './NoiseAlignment';

import type NetworkBinaryStream from '../../NetworkBinaryStream';
import type { AttributeValue } from './EnvironmentAttributeData';
import { ProtocolCodecErrors } from '@jsprismarine/errors/protocol/codec';

/**
 * Which alternative the `Payload` of an {@link EnvironmentAttributeData2225} carries. The value
 * is the alternative's index in the schema's `oneOf`, written as the varuint32 selector on the
 * wire.
 */
export enum AttributePayloadType {
    /** `ConstantAttributeData`: one value, no transition. */
    Constant = 0,
    /** `TransitionAttributeData`: a transition between two values. */
    Transition = 1,
    /** `NoiseTransitionAttributeData`: a transition between two values that a noise drives. */
    NoiseTransition = 2
}

/** The docs' `TransitionSettingsData`: how long a transition runs and how it eases. */
export interface TransitionSettings {
    /** `TotalTransitionTicks` the transition lasts, a varuint32. */
    totalTransitionTicks: number;
    /** `CurrentTransitionTicks` elapsed since the transition started, a varuint32. */
    currentTransitionTicks: number;
    /** `Easing` curve, an `easing_function` written as its numeric value (`Enum-as-Value`, ZigZag varint32). */
    easing: EasingType;
    /** `ClockName` the transition follows. */
    clockName: string;
}

/** The docs' `NoiseTransitionSettingsData`: {@link TransitionSettings} plus the noise that drives the transition. */
export interface NoiseTransitionSettings extends TransitionSettings {
    /** `LocalTransitionTicks` elapsed in the noise-local part of the transition, a varuint32. */
    localTransitionTicks: number;
    /** `NoiseName` of the noise the transition samples. */
    noiseName: string;
    /** `NoiseAlignment` of that noise. */
    noiseAlignment: NoiseAlignment;
}

/** The `Payload` of an {@link EnvironmentAttributeData2225}. `type` picks the alternative and its fields. */
export type AttributePayload =
    | {
          type: AttributePayloadType.Constant;
          /** `Attribute`, the value in effect. */
          attribute: AttributeValue;
      }
    | {
          type: AttributePayloadType.Transition;
          /** `FromAttribute`, the value the transition starts from. */
          fromAttribute: AttributeValue;
          /** `ToAttribute`, the value the transition ends at. */
          toAttribute: AttributeValue;
          /** `Settings` of the transition. */
          settings: TransitionSettings;
      }
    | {
          type: AttributePayloadType.NoiseTransition;
          /** `FromAttribute`, the value the transition starts from. */
          fromAttribute: AttributeValue;
          /** `ToAttribute`, the value the transition ends at. */
          toAttribute: AttributeValue;
          /** `Settings` of the noise-driven transition. */
          settings: NoiseTransitionSettings;
      };

/** Writes the three fields every transition settings type opens with. */
const writeTransitionSettings = (stream: NetworkBinaryStream, settings: TransitionSettings): void => {
    stream.writeUnsignedVarInt(settings.totalTransitionTicks);
    stream.writeUnsignedVarInt(settings.currentTransitionTicks);
    stream.writeVarInt(settings.easing);
    stream.writeString(settings.clockName);
};

/**
 * Reads the four fields every transition settings type opens with.
 * @throws when `Easing` is not one of the `easing_function` values.
 */
const readTransitionSettings = (stream: NetworkBinaryStream): TransitionSettings => {
    const totalTransitionTicks = stream.readUnsignedVarInt();
    const currentTransitionTicks = stream.readUnsignedVarInt();
    const easing = stream.readVarInt();
    if (typeof EasingType[easing] !== 'string') throw new ProtocolCodecErrors.UnknownEasingFunctionId({ easing });
    return { totalTransitionTicks, currentTransitionTicks, easing, clockName: stream.readString() };
};

/**
 * One `EnvironmentAttributeData` as protocol 2225 sends it: a named environment attribute of an
 * attribute layer. Protocol 2225 replaced the 2193 field list (see
 * {@link ./EnvironmentAttributeData.ts | EnvironmentAttributeData}) with a `Payload` variant.
 *
 * Wire order: `AttributeName` (string), then `Payload` as a Cereal tagged variant, a varuint32
 * selector (the {@link AttributePayloadType} value) followed by the alternative's fields.
 * `ConstantAttributeData` is `Attribute`. `TransitionAttributeData` is `FromAttribute`,
 * `ToAttribute`, then `Settings` as `TransitionSettingsData`: `TotalTransitionTicks` and
 * `CurrentTransitionTicks` as varuint32, `Easing` as a ZigZag varint32 value, `ClockName` as a
 * string. `NoiseTransitionAttributeData` is the same three fields with `NoiseTransitionSettingsData`,
 * which continues with `LocalTransitionTicks` as a varuint32, `NoiseName` as a string and
 * `NoiseAlignment`. Attribute values are encoded as the 2193 layout encodes them, except that
 * `FromAttribute` and `ToAttribute` are no longer optional.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/types/environment-attribute-data/
 */
export default class EnvironmentAttributeData2225 extends NetworkStructure {
    public constructor(
        /** `AttributeName`, at most 128 characters. */
        public attributeName = '',
        /** `Payload`: a constant value or a transition. Defaults to a constant boolean `false`. */
        public payload: AttributePayload = {
            type: AttributePayloadType.Constant,
            attribute: { type: AttributeDataType.Bool, value: false, operation: BoolAttributeOperation.OVERRIDE }
        }
    ) {
        super();
    }

    /** Writes `AttributeName`, then the `Payload` selector and the alternative's fields. */
    public serialize(stream: NetworkBinaryStream): void {
        stream.writeString(this.attributeName);
        const payload = this.payload;
        stream.writeUnsignedVarInt(payload.type);
        switch (payload.type) {
            case AttributePayloadType.Constant:
                writeAttributeValue(stream, payload.attribute);
                break;

            case AttributePayloadType.Transition:
                writeAttributeValue(stream, payload.fromAttribute);
                writeAttributeValue(stream, payload.toAttribute);
                writeTransitionSettings(stream, payload.settings);
                break;

            case AttributePayloadType.NoiseTransition:
                writeAttributeValue(stream, payload.fromAttribute);
                writeAttributeValue(stream, payload.toAttribute);
                writeTransitionSettings(stream, payload.settings);
                stream.writeUnsignedVarInt(payload.settings.localTransitionTicks);
                stream.writeString(payload.settings.noiseName);
                payload.settings.noiseAlignment.serialize(stream);
                break;
        }
    }

    /**
     * Reads `AttributeName` and the `Payload` variant.
     * @throws when a selector, an enum name or an easing value on the wire matches no known member.
     */
    public deserialize(stream: NetworkBinaryStream): void {
        this.attributeName = stream.readString();
        const type = stream.readUnsignedVarInt();
        switch (type) {
            case AttributePayloadType.Constant:
                this.payload = { type, attribute: readAttributeValue(stream) };
                break;

            case AttributePayloadType.Transition: {
                const fromAttribute = readAttributeValue(stream);
                const toAttribute = readAttributeValue(stream);
                this.payload = { type, fromAttribute, toAttribute, settings: readTransitionSettings(stream) };
                break;
            }

            case AttributePayloadType.NoiseTransition: {
                const fromAttribute = readAttributeValue(stream);
                const toAttribute = readAttributeValue(stream);
                const settings = readTransitionSettings(stream);
                this.payload = {
                    type,
                    fromAttribute,
                    toAttribute,
                    settings: {
                        ...settings,
                        localTransitionTicks: stream.readUnsignedVarInt(),
                        noiseName: stream.readString(),
                        noiseAlignment: NoiseAlignment.deserialize(stream)
                    }
                };
                break;
            }

            default:
                throw new ProtocolCodecErrors.UnknownAttributePayloadAlternative({ type });
        }
    }
}
