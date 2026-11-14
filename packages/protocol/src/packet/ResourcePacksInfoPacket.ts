import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { resourcePacksInfoPacket } from '../wire/definitions/resourcePacks';
import { layoutAt } from '../wire/WireLayout';

import type NetworkBinaryStream from '../NetworkBinaryStream';
import type { PayloadOf } from '../wire/define';

/** One `PackInfoData` entry of the `Resource Packs` list. */
export interface ResourcePackEntry {
    /** `Pack Id Version`. */
    id: PackIdVersion;
    /** `Pack Size` in bytes. */
    sizeBytes: bigint;
    /** `Content Key`, the decryption key for an encrypted pack. Empty for an unencrypted one. */
    contentKey: string;
    /** `Subpack Name`. Empty when no subpack is selected. */
    subPackName: string;
    /** `Content Identity`, the marketplace identity string. */
    contentIdentity: string;
    /** `Has Scripts`. */
    hasScripts: boolean;
    /** `Is Addon Pack`. */
    isAddonPack: boolean;
    /** `Is Ray Tracing Capable`. */
    isRayTracingCapable: boolean;
    /** `CDN URL` the client may download the pack from. Empty when the server serves the chunks. */
    cdnUrl: string;
}

/**
 * A `PackIdVersion`: the `Pack UUID` as two little-endian uint64 halves, then the
 * `Pack Version` string.
 */
export interface PackIdVersion {
    /** `Most Significant Bits` of the uuid. */
    uuidMostSignificant: bigint;
    /** `Least Significant Bits` of the uuid. */
    uuidLeastSignificant: bigint;
    /** The semantic version string, for example "1.2.3". */
    version: string;
}

/** The fields of a `ResourcePacksInfoPacket`, in wire order. */
export type ResourcePacksInfo = PayloadOf<typeof resourcePacksInfoPacket>;

/**
 * Which packs the client has to fetch before it may join.
 *
 * Protocol 2193 layout, in wire order: `Resource Pack Required`, `Has Addon Packs`,
 * `Has Scripts` and `Force Disable Vibrant Visuals` as one byte each, then
 * `World Template Id And Version` as a {@link PackIdVersion}, then `Resource Packs` as a
 * varuint32 count followed by one {@link ResourcePackEntry} per pack. Each entry is its
 * `Pack Id Version`, `Pack Size` as a little-endian uint64, `Content Key`, `Subpack Name`,
 * `Content Identity`, the `Has Scripts`, `Is Addon Pack` and `Is Ray Tracing Capable` bytes,
 * then `CDN URL`. Strings are a varuint32 byte length followed by UTF-8.
 *
 * The fourth flag and the world template arrived at 2168; a reader without them takes the
 * flag for the start of the template and drops the connection.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/resource-packs-info-packet/
 */
export default class ResourcePacksInfoPacket extends NetworkPacket<ResourcePacksInfo> {
    public get id(): number {
        return PacketIdentifier.RESOURCE_PACKS_INFO;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: ResourcePacksInfo): void {
        layoutAt(resourcePacksInfoPacket, this.codecProtocol).encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): ResourcePacksInfo {
        return layoutAt(resourcePacksInfoPacket, this.codecProtocol).decode(stream);
    }
}
