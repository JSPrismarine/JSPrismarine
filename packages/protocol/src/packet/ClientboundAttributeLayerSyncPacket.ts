import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import AttributeLayerData from '../structure/AttributeLayerData';
import AttributeLayerSettings from '../structure/AttributeLayerSettings';
import EnvironmentAttributeData from '../structure/EnvironmentAttributeData';

import type NetworkBinaryStream from '../NetworkBinaryStream';

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

/** The `Data` variant of a `ClientboundAttributeLayerSyncPacket`. `type` picks the alternative and its fields. */
export type AttributeLayerSyncData =
    | {
          type: AttributeLayerSyncDataType.UpdateAttributeLayers;
          /** `Attribute Layers`, one `AttributeLayerData` per layer. */
          attributeLayers: AttributeLayerData[];
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
          attributes: EnvironmentAttributeData[];
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

/** The fields of a `ClientboundAttributeLayerSyncPacket`, in wire order. */
export interface ClientboundAttributeLayerSync {
    /** `Data`, the one alternative this packet carries. */
    data: AttributeLayerSyncData;
}

/**
 * Syncs the server's environment attribute layers (fog, lighting and similar per-dimension
 * attributes blended by priority and weight) to the client.
 *
 * Protocol 2193 layout, in wire order: `Data` as a Cereal tagged variant, a varuint32
 * selector (the {@link AttributeLayerSyncDataType} value) followed by the alternative's
 * fields. Every list is a varuint32 count then its items. `UpdateAttributeLayersData` is
 * `Attribute Layers`, a list of {@link AttributeLayerData}. The other three alternatives
 * open with `Attribute Layer Name` (string) and `Attribute Layer Dimension` (ZigZag
 * varint32), then `UpdateAttributeLayerSettingsData` continues with `Attributes Layer
 * Settings` as an {@link AttributeLayerSettings}, `UpdateEnvironmentAttributesData` with
 * `Attributes` as a list of {@link EnvironmentAttributeData}, and
 * `RemoveEnvironmentAttributesData` with `Attributes` as a list of strings.
 *
 * Mojang merged four earlier drafts (`ClientboundAttributeLayerPacket`,
 * `ClientboundAttributeLayerSettingsPacket`, `ClientboundEnvironmentAttributeUpdatePacket`
 * and `ClientboundEnvironmentAttributeRemovePacket`) into this one variant. The 1.26.51
 * schema marks the packet "Currently disabled", so no release client has been seen to
 * handle it. Protocol 2207 restructures `EnvironmentAttributeData` and drops `NoiseName`.
 */
export default class ClientboundAttributeLayerSyncPacket extends NetworkPacket<ClientboundAttributeLayerSync> {
    public get id(): number {
        return PacketIdentifier.CLIENTBOUND_ATTRIBUTE_LAYER_SYNC;
    }

    protected serializePayload(stream: NetworkBinaryStream, { data }: ClientboundAttributeLayerSync): void {
        stream.writeUnsignedVarInt(data.type);

        switch (data.type) {
            case AttributeLayerSyncDataType.UpdateAttributeLayers:
                stream.writeUnsignedVarInt(data.attributeLayers.length);
                for (const layer of data.attributeLayers) layer.serialize(stream);
                break;

            case AttributeLayerSyncDataType.UpdateAttributeLayerSettings:
                stream.writeString(data.attributeLayerName);
                stream.writeVarInt(data.attributeLayerDimension);
                data.attributeLayerSettings.serialize(stream);
                break;

            case AttributeLayerSyncDataType.UpdateEnvironmentAttributes:
                stream.writeString(data.attributeLayerName);
                stream.writeVarInt(data.attributeLayerDimension);
                stream.writeUnsignedVarInt(data.attributes.length);
                for (const attribute of data.attributes) attribute.serialize(stream);
                break;

            case AttributeLayerSyncDataType.RemoveEnvironmentAttributes:
                stream.writeString(data.attributeLayerName);
                stream.writeVarInt(data.attributeLayerDimension);
                stream.writeUnsignedVarInt(data.attributes.length);
                for (const name of data.attributes) stream.writeString(name);
                break;
        }
    }

    protected deserializePayload(stream: NetworkBinaryStream): ClientboundAttributeLayerSync {
        const type = stream.readUnsignedVarInt();

        switch (type) {
            case AttributeLayerSyncDataType.UpdateAttributeLayers: {
                const attributeLayers: AttributeLayerData[] = [];
                let count = stream.readUnsignedVarInt();
                while (count-- > 0) attributeLayers.push(AttributeLayerData.deserialize(stream));
                return { data: { type, attributeLayers } };
            }

            case AttributeLayerSyncDataType.UpdateAttributeLayerSettings:
                return {
                    data: {
                        type,
                        attributeLayerName: stream.readString(),
                        attributeLayerDimension: stream.readVarInt(),
                        attributeLayerSettings: AttributeLayerSettings.deserialize(stream)
                    }
                };

            case AttributeLayerSyncDataType.UpdateEnvironmentAttributes: {
                const attributeLayerName = stream.readString();
                const attributeLayerDimension = stream.readVarInt();
                const attributes: EnvironmentAttributeData[] = [];
                let count = stream.readUnsignedVarInt();
                while (count-- > 0) attributes.push(EnvironmentAttributeData.deserialize(stream));
                return { data: { type, attributeLayerName, attributeLayerDimension, attributes } };
            }

            case AttributeLayerSyncDataType.RemoveEnvironmentAttributes: {
                const attributeLayerName = stream.readString();
                const attributeLayerDimension = stream.readVarInt();
                const attributes: string[] = [];
                let count = stream.readUnsignedVarInt();
                while (count-- > 0) attributes.push(stream.readString());
                return { data: { type, attributeLayerName, attributeLayerDimension, attributes } };
            }

            default:
                throw new Error(`Unknown ClientboundAttributeLayerSyncPacket data variant ${type}`);
        }
    }
}
