import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

import type NetworkBinaryStream from '../NetworkBinaryStream';

export interface ResourcePackEntry {
    id: PackIdVersion;
    sizeBytes: bigint;
    contentKey: string;
    subPackName: string;
    contentIdentity: string;
    hasScripts: boolean;
    isAddonPack: boolean;
    isRayTracingCapable: boolean;
    cdnUrl: string;
}

/** A pack's identity: the uuid as two halves of a 128 bit number, and a semantic version. */
export interface PackIdVersion {
    uuidMostSignificant: bigint;
    uuidLeastSignificant: bigint;
    version: string;
}

export interface ResourcePacksInfo {
    resourcePackRequired: boolean;
    hasAddonPacks: boolean;
    hasScripts: boolean;
    /** Turns deferred rendering off for the session, whatever the client would prefer. */
    forceDisableVibrantVisuals: boolean;
    /** The world template this world came from. All zeroes when it came from none. */
    worldTemplate: PackIdVersion;
    packs: ResourcePackEntry[];
}

/**
 * Which packs the client has to fetch before it may join.
 *
 * Four flags, the world template's identity, then the packs. Two things moved at 2168: a
 * fourth flag appeared after the three that were there, and the world template - a uuid
 * written as two 64 bit halves rather than a string, followed by its version - was inserted
 * ahead of the list. A reader that predates either of them takes the flag for the start of
 * the template and the connection drops right here.
 *
 * Each entry now identifies its pack the same way, where 748 wrote the uuid and version as
 * two strings.
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
