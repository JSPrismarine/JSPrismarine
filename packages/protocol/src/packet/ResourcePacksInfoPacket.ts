import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

import type NetworkBinaryStream from '../NetworkBinaryStream';

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
export interface ResourcePacksInfo {
    /** `Resource Pack Required`: the client must apply the server's packs to join. */
    resourcePackRequired: boolean;
    /** `Has Addon Packs`: at least one pack is an add-on pack. */
    hasAddonPacks: boolean;
    /** `Has Scripts`: at least one pack carries client scripts. */
    hasScripts: boolean;
    /** `Force Disable Vibrant Visuals`: turns deferred rendering off for the session, whatever the client would prefer. */
    forceDisableVibrantVisuals: boolean;
    /** `World Template Id And Version`. All zeroes and an empty version when the world came from no template. */
    worldTemplate: PackIdVersion;
    /** `Resource Packs`, one entry per pack the client needs. */
    packs: ResourcePackEntry[];
}

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
 */
export default class ResourcePacksInfoPacket extends NetworkPacket<ResourcePacksInfo> {
    public get id(): number {
        return PacketIdentifier.RESOURCE_PACKS_INFO;
    }

    private static writeId(stream: NetworkBinaryStream, id: PackIdVersion): void {
        stream.writeUnsignedLongLE(id.uuidMostSignificant);
        stream.writeUnsignedLongLE(id.uuidLeastSignificant);
        stream.writeString(id.version);
    }

    private static readId(stream: NetworkBinaryStream): PackIdVersion {
        return {
            uuidMostSignificant: stream.readUnsignedLongLE(),
            uuidLeastSignificant: stream.readUnsignedLongLE(),
            version: stream.readString()
        };
    }

    protected serializePayload(stream: NetworkBinaryStream, data: ResourcePacksInfo): void {
        stream.writeBoolean(data.resourcePackRequired);
        stream.writeBoolean(data.hasAddonPacks);
        stream.writeBoolean(data.hasScripts);
        stream.writeBoolean(data.forceDisableVibrantVisuals);
        ResourcePacksInfoPacket.writeId(stream, data.worldTemplate);

        stream.writeUnsignedVarInt(data.packs.length);
        for (const pack of data.packs) {
            ResourcePacksInfoPacket.writeId(stream, pack.id);
            stream.writeUnsignedLongLE(pack.sizeBytes);
            stream.writeString(pack.contentKey);
            stream.writeString(pack.subPackName);
            stream.writeString(pack.contentIdentity);
            stream.writeBoolean(pack.hasScripts);
            stream.writeBoolean(pack.isAddonPack);
            stream.writeBoolean(pack.isRayTracingCapable);
            stream.writeString(pack.cdnUrl);
        }
    }

    protected deserializePayload(stream: NetworkBinaryStream): ResourcePacksInfo {
        const resourcePackRequired = stream.readBoolean();
        const hasAddonPacks = stream.readBoolean();
        const hasScripts = stream.readBoolean();
        const forceDisableVibrantVisuals = stream.readBoolean();
        const worldTemplate = ResourcePacksInfoPacket.readId(stream);

        const packs: ResourcePackEntry[] = [];
        let count = stream.readUnsignedVarInt();
        while (count-- > 0) {
            packs.push({
                id: ResourcePacksInfoPacket.readId(stream),
                sizeBytes: stream.readUnsignedLongLE(),
                contentKey: stream.readString(),
                subPackName: stream.readString(),
                contentIdentity: stream.readString(),
                hasScripts: stream.readBoolean(),
                isAddonPack: stream.readBoolean(),
                isRayTracingCapable: stream.readBoolean(),
                cdnUrl: stream.readString()
            });
        }

        return { resourcePackRequired, hasAddonPacks, hasScripts, forceDisableVibrantVisuals, worldTemplate, packs };
    }
}
