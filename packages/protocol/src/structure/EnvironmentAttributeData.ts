import NetworkStructure from '../NetworkStructure';
import { isEasingFunction } from './CameraInstruction';
import NoiseAlignment from './NoiseAlignment';

import type NetworkBinaryStream from '../NetworkBinaryStream';
import type { EasingFunction } from './CameraInstruction';

/**
 * Which alternative an attribute value variant (`Attribute`, `FromAttribute` or `ToAttribute`)
 * carries. The value is the alternative's index in the schema's `oneOf`, written as the
 * varuint32 selector on the wire.
 */
export enum AttributeDataType {
    /** `BoolAttributeData`: a boolean `value` and a {@link BoolAttributeOperation}. */
    Bool = 0,
    /** `FloatAttributeData`: a float `value`, a {@link FloatAttributeOperation} and optional constraints. */
    Float = 1,
    /** `ColorAttributeData`: a `Color255RGBA` `value` and a {@link ColorAttributeOperation}. */
    Color = 2
}

/** The docs enum `BoolAttributeOperation`: how a boolean attribute combines with the layers below it. */
export enum BoolAttributeOperation {
    OVERRIDE = 0,
    ALPHA_BLEND = 1,
    AND = 2,
    NAND = 3,
    OR = 4,
    NOR = 5,
    XOR = 6,
    XNOR = 7
}

/** The docs enum `FloatAttributeOperation`: how a float attribute combines with the layers below it. */
export enum FloatAttributeOperation {
    OVERRIDE = 0,
    ALPHA_BLEND = 1,
    ADD = 2,
    SUBTRACT = 3,
    MULTIPLY = 4,
    MINIMUM = 5,
    MAXIMUM = 6
}

/** The docs enum `ColorAttributeOperation`: how a color attribute combines with the layers below it. */
export enum ColorAttributeOperation {
    OVERRIDE = 0,
    ALPHA_BLEND = 1,
    ADD = 2,
    SUBTRACT = 3,
    MULTIPLY = 4
}

/**
 * One attribute value, the shape of `Attribute`, `FromAttribute` and `ToAttribute`. `type`
 * picks the alternative and the fields that follow it.
 */
export type AttributeValue =
    | {
          type: AttributeDataType.Bool;
          /** `value`. */
          value: boolean;
          /** `operation`. */
          operation: BoolAttributeOperation;
      }
    | {
          type: AttributeDataType.Float;
          /** `value`, a little-endian float. */
          value: number;
          /** `operation`. */
          operation: FloatAttributeOperation;
          /** `constraintMin`, the lowest result the operation may produce. */
          constraintMin?: number;
          /** `constraintMax`, the highest result the operation may produce. */
          constraintMax?: number;
      }
    | {
          type: AttributeDataType.Color;
          /** `value`, a `Color255RGBA` packed into four bytes and read as a little-endian uint32. */
          value: number;
          /** `operation`. */
          operation: ColorAttributeOperation;
      };

/** The fields of an `EnvironmentAttributeData`, in wire order. */
export interface EnvironmentAttributeFields {
    /** `AttributeName`, at most 128 characters. */
    attributeName: string;
    /** `FromAttribute`, the value a running transition started from. Unset when nothing is transitioning. */
    fromAttribute?: AttributeValue;
    /** `Attribute`, the value in effect now. */
    attribute: AttributeValue;
    /** `ToAttribute`, the value a running transition ends at. Unset when nothing is transitioning. */
    toAttribute?: AttributeValue;
    /** `CurrentTransitionTicks` elapsed since the transition started. */
    currentTransitionTicks: number;
    /** `TotalTransitionTicks` the transition lasts. */
    totalTransitionTicks: number;
    /** `Easing` curve the transition follows, an `easing_function` name such as "in_out_quad". */
    easing: EasingFunction;
    /** `LocalTransitionTicks` elapsed in the noise-local part of the transition. */
    localTransitionTicks: number;
    /** `NoiseTransition`: whether the layer's noise drives the transition. */
    noiseTransition: boolean;
    /** `NoiseAlignment` of that noise. */
    noiseAlignment: NoiseAlignment;
}

/** A numeric enum object, which maps member names to values and values back to names. */
type NumericEnum = Record<string, string | number>;

/**
 * The name of an enum member, which is what the wire carries for an enum the schema does not
 * mark `Enum-as-Value`.
 * @throws when the value is not a member.
 */
const nameOf = (members: NumericEnum, value: number, label: string): string => {
    const name = members[value];
    if (typeof name !== 'string') throw new Error(`Unknown ${label} ${value}`);
    return name;
};

/**
 * The value of an enum member read from the wire by name.
 * @throws when no member has that name.
 */
const valueOf = (members: NumericEnum, name: string, label: string): number => {
    const value = members[name];
    if (typeof value !== 'number') throw new Error(`Unknown ${label} "${name}"`);
    return value;
};

/**
 * One `EnvironmentAttributeData`: a named environment attribute of an attribute layer, with
 * the transition it may be in the middle of. `ClientboundAttributeLayerSyncPacket` carries a
 * list of them inside each `AttributeLayerData` and in `UpdateEnvironmentAttributesData`.
 *
 * Protocol 2193 wire order: `AttributeName` (string), `FromAttribute` as an optional attribute
 * value (a presence byte, then the value only when set), `Attribute` as an attribute value,
 * `ToAttribute` as another optional one, `CurrentTransitionTicks` and `TotalTransitionTicks`
 * as little-endian uint32, `Easing` as an `easing_function` string ({@link EasingFunction},
 * shared with the camera instructions; the schema does not mark the enum `Enum-as-Value`),
 * `LocalTransitionTicks` as a little-endian uint32, `NoiseTransition` as one byte, then
 * `NoiseAlignment` as a {@link NoiseAlignment}.
 *
 * An attribute value is a Cereal tagged variant: a varuint32 selector (the
 * {@link AttributeDataType} value) followed by the alternative's fields. `BoolAttributeData`
 * is `value` as one byte then `operation` as a string. `FloatAttributeData` is `value` as a
 * little-endian float, `operation` as a string, then `constraintMin` and `constraintMax` as
 * optional little-endian floats (a presence byte each). `ColorAttributeData` is `value` as
 * four bytes then `operation` as a string. The operation strings are the docs' member names
 * (`OVERRIDE`, `ALPHA_BLEND`, ...). The schema gives `operation` a default rather than making
 * it optional, so it is always on the wire.
 *
 * gophertunnel master (protocol 2193) writes `operation` as an optional little-endian int32
 * instead of a string; the docs and the way gophertunnel itself writes every other enum the
 * schema leaves without `Enum-as-Value` (command permission levels, animate swing sources)
 * say string. No capture settles it, since the game marks the packet "Currently disabled".
 * Protocol 2207 restructures this type around a `Payload` variant.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/types/environment-attribute-data/}
 */
export default class EnvironmentAttributeData extends NetworkStructure implements EnvironmentAttributeFields {
    public attributeName: string;
    public fromAttribute?: AttributeValue;
    public attribute: AttributeValue;
    public toAttribute?: AttributeValue;
    public currentTransitionTicks: number;
    public totalTransitionTicks: number;
    public easing: EasingFunction;
    public localTransitionTicks: number;
    public noiseTransition: boolean;
    public noiseAlignment: NoiseAlignment;

    /**
     * Creates an environment attribute.
     * @param fields - Every field in wire order. Defaults to an unnamed, non-transitioning boolean `false`.
     */
    public constructor(
        fields: EnvironmentAttributeFields = {
            attributeName: '',
            attribute: { type: AttributeDataType.Bool, value: false, operation: BoolAttributeOperation.OVERRIDE },
            currentTransitionTicks: 0,
            totalTransitionTicks: 0,
            easing: 'linear',
            localTransitionTicks: 0,
            noiseTransition: false,
            noiseAlignment: new NoiseAlignment()
        }
    ) {
        super();
        this.attributeName = fields.attributeName;
        this.fromAttribute = fields.fromAttribute;
        this.attribute = fields.attribute;
        this.toAttribute = fields.toAttribute;
        this.currentTransitionTicks = fields.currentTransitionTicks;
        this.totalTransitionTicks = fields.totalTransitionTicks;
        this.easing = fields.easing;
        this.localTransitionTicks = fields.localTransitionTicks;
        this.noiseTransition = fields.noiseTransition;
        this.noiseAlignment = fields.noiseAlignment;
    }

    private static writeAttributeValue(stream: NetworkBinaryStream, attribute: AttributeValue): void {
        stream.writeUnsignedVarInt(attribute.type);
        switch (attribute.type) {
            case AttributeDataType.Bool:
                stream.writeBoolean(attribute.value);
                stream.writeString(nameOf(BoolAttributeOperation, attribute.operation, 'BoolAttributeOperation'));
                break;

            case AttributeDataType.Float:
                stream.writeFloatLE(attribute.value);
                stream.writeString(nameOf(FloatAttributeOperation, attribute.operation, 'FloatAttributeOperation'));
                stream.writeBoolean(attribute.constraintMin !== undefined);
                if (attribute.constraintMin !== undefined) stream.writeFloatLE(attribute.constraintMin);
                stream.writeBoolean(attribute.constraintMax !== undefined);
                if (attribute.constraintMax !== undefined) stream.writeFloatLE(attribute.constraintMax);
                break;

            case AttributeDataType.Color:
                stream.writeUnsignedIntLE(attribute.value);
                stream.writeString(nameOf(ColorAttributeOperation, attribute.operation, 'ColorAttributeOperation'));
                break;
        }
    }

    private static readAttributeValue(stream: NetworkBinaryStream): AttributeValue {
        const type = stream.readUnsignedVarInt();
        switch (type) {
            case AttributeDataType.Bool: {
                const value = stream.readBoolean();
                const operation = valueOf(BoolAttributeOperation, stream.readString(), 'BoolAttributeOperation');
                return { type, value, operation };
            }

            case AttributeDataType.Float: {
                const value = stream.readFloatLE();
                const operation = valueOf(FloatAttributeOperation, stream.readString(), 'FloatAttributeOperation');
                const constraintMin = stream.readBoolean() ? stream.readFloatLE() : undefined;
                const constraintMax = stream.readBoolean() ? stream.readFloatLE() : undefined;
                return { type, value, operation, constraintMin, constraintMax };
            }

            case AttributeDataType.Color: {
                const value = stream.readUnsignedIntLE();
                const operation = valueOf(ColorAttributeOperation, stream.readString(), 'ColorAttributeOperation');
                return { type, value, operation };
            }

            default:
                throw new Error(`Unknown attribute value alternative ${type}`);
        }
    }

    private static writeOptionalAttributeValue(stream: NetworkBinaryStream, attribute?: AttributeValue): void {
        stream.writeBoolean(attribute !== undefined);
        if (attribute !== undefined) EnvironmentAttributeData.writeAttributeValue(stream, attribute);
    }

    private static readOptionalAttributeValue(stream: NetworkBinaryStream): AttributeValue | undefined {
        return stream.readBoolean() ? EnvironmentAttributeData.readAttributeValue(stream) : undefined;
    }

    /** Writes every field in the order the docs list them. */
    public serialize(stream: NetworkBinaryStream): void {
        stream.writeString(this.attributeName);
        EnvironmentAttributeData.writeOptionalAttributeValue(stream, this.fromAttribute);
        EnvironmentAttributeData.writeAttributeValue(stream, this.attribute);
        EnvironmentAttributeData.writeOptionalAttributeValue(stream, this.toAttribute);
        stream.writeUnsignedIntLE(this.currentTransitionTicks);
        stream.writeUnsignedIntLE(this.totalTransitionTicks);
        stream.writeString(this.easing);
        stream.writeUnsignedIntLE(this.localTransitionTicks);
        stream.writeBoolean(this.noiseTransition);
        this.noiseAlignment.serialize(stream);
    }

    /**
     * Reads every field in the order the docs list them.
     * @throws when a selector or an enum name on the wire matches no known member.
     */
    public deserialize(stream: NetworkBinaryStream): void {
        this.attributeName = stream.readString();
        this.fromAttribute = EnvironmentAttributeData.readOptionalAttributeValue(stream);
        this.attribute = EnvironmentAttributeData.readAttributeValue(stream);
        this.toAttribute = EnvironmentAttributeData.readOptionalAttributeValue(stream);
        this.currentTransitionTicks = stream.readUnsignedIntLE();
        this.totalTransitionTicks = stream.readUnsignedIntLE();
        const easing = stream.readString();
        if (!isEasingFunction(easing)) throw new Error(`Unknown easing_function "${easing}"`);
        this.easing = easing;
        this.localTransitionTicks = stream.readUnsignedIntLE();
        this.noiseTransition = stream.readBoolean();
        this.noiseAlignment = NoiseAlignment.deserialize(stream);
    }
}
