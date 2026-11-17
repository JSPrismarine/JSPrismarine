/**
 * `ClientboundAttributeLayerSyncPacket`: syncs the server's environment attribute layers (fog,
 * lighting and similar per-dimension attributes blended by priority and weight) to the client.
 *
 * The payload is one `Data` Cereal tagged variant: a varuint32 selector (the
 * {@link AttributeLayerSyncDataType} value) followed by the chosen alternative's fields. The
 * fields after the selector depend on its value, so the variant is one `custom` wire type.
 * Protocol 2225 reworked `AttributeLayerData` and `EnvironmentAttributeData`, which the
 * `UpdateAttributeLayersData` and `UpdateEnvironmentAttributesData` alternatives carry, so a gate
 * cannot reach them: the whole `Data` variant is one gated field per layout, and
 * `ClientboundAttributeLayerSyncPacket` fills whichever one the stamped protocol version puts on
 * the wire. The other two alternatives are byte-identical in both layouts. The docs mark the
 * packet "Currently disabled", so no release client has been seen to handle it.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/clientbound-attribute-layer-sync-packet/
 */
import NetworkBinaryStream from '../../NetworkBinaryStream';
import AttributeLayerData from '../../structure/AttributeLayerData';
import AttributeLayerData2225 from '../../structure/AttributeLayerData2225';
import AttributeLayerSettings from '../../structure/AttributeLayerSettings';
import EnvironmentAttributeData from '../../structure/EnvironmentAttributeData';
import EnvironmentAttributeData2225 from '../../structure/EnvironmentAttributeData2225';
import { definePacket, gated } from '../define';
import * as t from '../fieldTypes';
import { SINCE_2225, UNTIL_2225 } from '../wireGates';

import type BinaryStream from '@jsprismarine/binaryutils';
import type NetworkStructure from '../../NetworkStructure';
import type { PayloadOf } from '../define';
import type { WireType } from '../fieldTypes';
import { ProtocolWireErrors } from '@jsprismarine/errors/protocol/wire';

/**
 * Which alternative of the `Data` variant a `ClientboundAttributeLayerSyncPacket` carries. The
 * value is the alternative's index in the schema's `oneOf`, written as the varuint32 selector
 * on the wire.
 */
export enum AttributeLayerSyncDataType {
    /** `UpdateAttributeLayersData`: full layer definitions, sent on join and when a layer is added. */
    UpdateAttributeLayers = 0,
    /** `UpdateAttributeLayerSettingsData`: new settings for one layer. */
    UpdateAttributeLayerSettings = 1,
    /** `UpdateEnvironmentAttributesData`: attributes of one layer that changed or were added. */
    UpdateEnvironmentAttributes = 2,
    /** `RemoveEnvironmentAttributesData`: attribute names removed from one layer. */
    RemoveEnvironmentAttributes = 3
}

/**
 * The `Data` variant of a `ClientboundAttributeLayerSyncPacket`. `type` picks the alternative and
 * its fields. `Layer` and `Attribute` are the structures of the protocol layout the data is for.
 */
export type AttributeLayerSyncDataOf<Layer, Attribute> =
    | {
          type: AttributeLayerSyncDataType.UpdateAttributeLayers;
          /** `Attribute Layers`, one `AttributeLayerData` per layer. */
          attributeLayers: Layer[];
      }
    | {
          type: AttributeLayerSyncDataType.UpdateAttributeLayerSettings;
          /** `Attribute Layer Name`, at most 128 characters. */
          attributeLayerName: string;
          /** `Attribute Layer Dimension`: 0 for the Overworld, 1 for the Nether, 2 for the End, custom ones from 1000. */
          attributeLayerDimension: number;
          /** `Attributes Layer Settings` (the docs' spelling), the layer's new settings. */
          attributeLayerSettings: AttributeLayerSettings;
      }
    | {
          type: AttributeLayerSyncDataType.UpdateEnvironmentAttributes;
          /** `Attribute Layer Name`, at most 128 characters. */
          attributeLayerName: string;
          /** `Attribute Layer Dimension`: 0 for the Overworld, 1 for the Nether, 2 for the End, custom ones from 1000. */
          attributeLayerDimension: number;
          /** `Attributes` that changed or were added, one `EnvironmentAttributeData` each. */
          attributes: Attribute[];
      }
    | {
          type: AttributeLayerSyncDataType.RemoveEnvironmentAttributes;
          /** `Attribute Layer Name`, at most 128 characters. */
          attributeLayerName: string;
          /** `Attribute Layer Dimension`: 0 for the Overworld, 1 for the Nether, 2 for the End, custom ones from 1000. */
          attributeLayerDimension: number;
          /** `Attributes` removed from the layer, each an attribute name of at most 128 characters. */
          attributes: string[];
      };

/** The `Data` variant as protocol 2193 sends it. */
export type AttributeLayerSyncData = AttributeLayerSyncDataOf<AttributeLayerData, EnvironmentAttributeData>;

/** The `Data` variant as protocol 2225 sends it, with the reworked layer and attribute structures. */
export type AttributeLayerSyncData2225 = AttributeLayerSyncDataOf<AttributeLayerData2225, EnvironmentAttributeData2225>;

/**
 * The stream as a `NetworkBinaryStream`, which the attribute structures read and write through.
 * @throws when the layout runs over a stream that is not one.
 */
const networkStream = (stream: BinaryStream): NetworkBinaryStream => {
    if (stream instanceof NetworkBinaryStream) return stream;
    throw new ProtocolWireErrors.AttributeLayerNeedsNetworkStream();
};

/**
 * A structure class as a wire type. The class reads and writes through `NetworkBinaryStream`
 * methods, which a layout's plain stream type does not declare, so this narrows the stream
 * instead of describing the structure's fields again.
 */
const structure = <T extends NetworkStructure>(wire: string, read: (stream: NetworkBinaryStream) => T): WireType<T> =>
    t.custom(
        wire,
        (stream, value) => value.serialize(networkStream(stream)),
        (stream) => read(networkStream(stream))
    );

/** `AttributeLayerData` as protocol 2193 sends it: one layer's full definition. */
const attributeLayerData = structure('AttributeLayerData', (stream) => AttributeLayerData.deserialize(stream));

/** `AttributeLayerData` as protocol 2225 sends it, without `NoiseName`. */
const attributeLayerData2225 = structure('AttributeLayerData', (stream) => AttributeLayerData2225.deserialize(stream));

/** `AttributeLayerSettings`: priority, weight and the two flags. */
const attributeLayerSettings = structure('AttributeLayerSettings', (stream) =>
    AttributeLayerSettings.deserialize(stream)
);

/** `EnvironmentAttributeData` as protocol 2193 sends it: one named attribute and its transition. */
const environmentAttributeData = structure('EnvironmentAttributeData', (stream) =>
    EnvironmentAttributeData.deserialize(stream)
);

/** `EnvironmentAttributeData` as protocol 2225 sends it: one named attribute and its `Payload` variant. */
const environmentAttributeData2225 = structure('EnvironmentAttributeData', (stream) =>
    EnvironmentAttributeData2225.deserialize(stream)
);

/**
 * The `Data` Cereal tagged variant: a varuint32 selector, then that alternative's fields. The
 * wire type of one protocol layout, given the codecs of the layer and attribute structures that
 * layout uses.
 *
 * Absent is `null`, which the definition's gate fallback also supplies. Writing `null` means the
 * payload carried the other layout's structures, which this layout cannot encode.
 */
const attributeLayerSyncDataWith = <Layer, Attribute>(
    layout: string,
    layer: WireType<Layer>,
    attribute: WireType<Attribute>
): WireType<AttributeLayerSyncDataOf<Layer, Attribute> | null> =>
    t.custom(
        'AttributeLayerSyncData',
        (stream, data) => {
            if (data === null) {
                throw new ProtocolWireErrors.MissingAttributeLayerData({ layout });
            }

            stream.writeUnsignedVarInt(data.type);

            switch (data.type) {
                case AttributeLayerSyncDataType.UpdateAttributeLayers:
                    t.list(layer).write(stream, data.attributeLayers);
                    break;

                case AttributeLayerSyncDataType.UpdateAttributeLayerSettings:
                    t.string.write(stream, data.attributeLayerName);
                    t.varint32.write(stream, data.attributeLayerDimension);
                    attributeLayerSettings.write(stream, data.attributeLayerSettings);
                    break;

                case AttributeLayerSyncDataType.UpdateEnvironmentAttributes:
                    t.string.write(stream, data.attributeLayerName);
                    t.varint32.write(stream, data.attributeLayerDimension);
                    t.list(attribute).write(stream, data.attributes);
                    break;

                case AttributeLayerSyncDataType.RemoveEnvironmentAttributes:
                    t.string.write(stream, data.attributeLayerName);
                    t.varint32.write(stream, data.attributeLayerDimension);
                    t.list(t.string).write(stream, data.attributes);
                    break;
            }
        },
        (stream) => {
            const type = stream.readUnsignedVarInt();

            switch (type) {
                case AttributeLayerSyncDataType.UpdateAttributeLayers:
                    return { type, attributeLayers: t.list(layer).read(stream) };

                case AttributeLayerSyncDataType.UpdateAttributeLayerSettings:
                    return {
                        type,
                        attributeLayerName: t.string.read(stream),
                        attributeLayerDimension: t.varint32.read(stream),
                        attributeLayerSettings: attributeLayerSettings.read(stream)
                    };

                case AttributeLayerSyncDataType.UpdateEnvironmentAttributes:
                    return {
                        type,
                        attributeLayerName: t.string.read(stream),
                        attributeLayerDimension: t.varint32.read(stream),
                        attributes: t.list(attribute).read(stream)
                    };

                case AttributeLayerSyncDataType.RemoveEnvironmentAttributes:
                    return {
                        type,
                        attributeLayerName: t.string.read(stream),
                        attributeLayerDimension: t.varint32.read(stream),
                        attributes: t.list(t.string).read(stream)
                    };

                default:
                    throw new ProtocolWireErrors.UnknownAttributeLayerDataType({ type });
            }
        }
    );

/** The fields sent to sync attribute layers, in wire order. */
export const clientboundAttributeLayerSyncPacket = definePacket('ClientboundAttributeLayerSyncPacket', {
    /** `Data` in the 2193 layout; the packet class leaves it `null` from 2225 on. */
    dataUntil2225: gated<AttributeLayerSyncData | null>(
        UNTIL_2225,
        attributeLayerSyncDataWith('2193', attributeLayerData, environmentAttributeData),
        null
    ),
    /** `Data` in the 2225 layout; the packet class leaves it `null` before 2225. */
    dataSince2225: gated<AttributeLayerSyncData2225 | null>(
        SINCE_2225,
        attributeLayerSyncDataWith('2225', attributeLayerData2225, environmentAttributeData2225),
        null
    )
});

/** Wire-shaped payload of `ClientboundAttributeLayerSyncPacket`: the `Data` variant under the key its layout travels as. */
export type ClientboundAttributeLayerSyncPayload = PayloadOf<typeof clientboundAttributeLayerSyncPacket>;
