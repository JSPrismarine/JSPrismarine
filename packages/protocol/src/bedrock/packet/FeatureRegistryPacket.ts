import NetworkPacket from '../../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { featureRegistryPacket } from '../wire/definitions/featureRegistry';
import { layoutAt } from '../../wire/WireLayout';

import type NetworkBinaryStream from '../../NetworkBinaryStream';
import type { FeatureRegistry } from '../wire/definitions/featureRegistry';

export type { FeatureRegistry, FeatureRegistryEntry } from '../wire/definitions/featureRegistry';

/**
 * The server's active feature registry, so the client can place features itself.
 *
 * Protocol 2193 and 2225 layout, identical in both, in wire order: `FeaturesDataList` as a varuint32 count followed by one
 * {@link FeatureRegistryEntry} per feature. Each entry is `Feature Name` then `Binary Json Output`,
 * both strings. Strings are a varuint32 byte length followed by UTF-8.
 *
 * A Bedrock Dedicated Server sends this to every joining client, with an empty list when the world
 * defines no custom features.
 *
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/feature-registry-packet/
 */
export default class FeatureRegistryPacket extends NetworkPacket<FeatureRegistry> {
    /** The name this packet's wire id is listed under. */
    public getName(): string {
        return 'FeatureRegistryPacket';
    }

    public get id(): number {
        return PacketIdentifier.FEATURE_REGISTRY;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: FeatureRegistry): void {
        layoutAt(featureRegistryPacket, this.codecProtocol).encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): FeatureRegistry {
        return layoutAt(featureRegistryPacket, this.codecProtocol).decode(stream);
    }
}
