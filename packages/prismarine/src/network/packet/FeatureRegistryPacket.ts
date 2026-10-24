import Identifiers from '../Identifiers';
import { NetworkUtil } from '../NetworkUtil';
import DataPacket from './DataPacket';

/** One `FeatureRegistry::FeatureBinaryJsonFormat` entry of the `FeaturesDataList`. */
export interface FeatureRegistryEntry {
    /** Feature Name: the identifier the feature is registered under, such as `minecraft:oak_tree_feature`. */
    name: string;
    /** Binary Json Output: the feature's JSON definition as a string. */
    binaryJson: string;
}

/**
 * The server's active feature registry, so a client that generates chunks itself can place
 * the features in them.
 *
 * A Bedrock Dedicated Server sends it to every joining client in the registry group after
 * `StartGame`, with an empty list when the world defines no custom features. This server
 * defines none and sends the empty list.
 *
 * **Bound To:** Client
 *
 * Protocol 2193 layout (docs id 191), one `FeaturesDataList` in wire order:
 *
 * | Name | Type | Notes |
 * | ---- |:----:|:-----:|
 * | FeaturesDataList | varuint32 count, then that many entries | each entry is `Feature Name` then `Binary Json Output`, both strings; see {@link FeatureRegistryEntry} |
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/feature-registry-packet/
 */
export default class FeatureRegistryPacket extends DataPacket {
    public static NetID = Identifiers.FeatureRegistryPacket;

    /** FeaturesDataList: one entry per feature the client may place itself. Empty by default. */
    public features: FeatureRegistryEntry[] = [];

    /** Reads the list of features. */
    public decodePayload(): void {
        this.features = [];
        let count = this.readUnsignedVarInt();
        while (count-- > 0) {
            this.features.push({
                name: NetworkUtil.readString(this),
                binaryJson: NetworkUtil.readString(this)
            });
        }
    }

    /** Writes the list of features. */
    public encodePayload(): void {
        this.writeUnsignedVarInt(this.features.length);
        for (const feature of this.features) {
            NetworkUtil.writeString(this, feature.name);
            NetworkUtil.writeString(this, feature.binaryJson);
        }
    }
}
