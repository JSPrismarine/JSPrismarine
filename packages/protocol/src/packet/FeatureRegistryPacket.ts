import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/** One `FeatureRegistry::FeatureBinaryJsonFormat` entry of the `FeaturesDataList`. */
export interface FeatureRegistryEntry {
    /** `Feature Name`, the identifier the feature is registered under, for example "minecraft:oak_tree_feature". */
    name: string;
    /** `Binary Json Output`, the feature's JSON definition serialized to a string. */
    binaryJson: string;
}

/** The fields of a `FeatureRegistryPacket`, in wire order. */
export interface FeatureRegistry {
    /** `FeaturesDataList`, one entry per feature the client should be able to place itself. */
    features: FeatureRegistryEntry[];
}

/**
 * The server's active feature registry, so the client can place features itself.
 *
 * Protocol 2193 layout, in wire order: `FeaturesDataList` as a varuint32 count followed by one
 * {@link FeatureRegistryEntry} per feature. Each entry is `Feature Name` then `Binary Json Output`,
 * both strings. Strings are a varuint32 byte length followed by UTF-8.
 *
 * A Bedrock Dedicated Server sends this to every joining client, with an empty list when the world
 * defines no custom features.
 */
export default class FeatureRegistryPacket extends NetworkPacket<FeatureRegistry> {
    public get id(): number {
        return PacketIdentifier.FEATURE_REGISTRY;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: FeatureRegistry): void {
        stream.writeUnsignedVarInt(data.features.length);
        for (const feature of data.features) {
            stream.writeString(feature.name);
            stream.writeString(feature.binaryJson);
        }
    }

    protected deserializePayload(stream: NetworkBinaryStream): FeatureRegistry {
        const features: FeatureRegistryEntry[] = [];
        let count = stream.readUnsignedVarInt();
        while (count-- > 0) {
            features.push({
                name: stream.readString(),
                binaryJson: stream.readString()
            });
        }

        return { features };
    }
}
