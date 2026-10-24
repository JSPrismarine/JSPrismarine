import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import EduSharedUriResource from '../structure/EduSharedUriResource';

import type NetworkBinaryStream from '../NetworkBinaryStream';
import type { EduSharedUriResourceData } from '../structure/EduSharedUriResource';

/** The fields of an `EduUriResourcePacket`, in wire order. */
export interface EduUriResource {
    /** `Edu Shared URI Resource`, the link and button label every client should show. */
    eduSharedUriResource: EduSharedUriResourceData;
}

/**
 * The link an Education Edition server shares with every connected client.
 *
 * Docs packet 170, server to client. `StartGamePacket` carries the same resource inside
 * `LevelSettings` for a joining player; this packet updates it for players already in the
 * world.
 *
 * Protocol 2193 layout: one {@link EduSharedUriResource}, which is `Button Name` then
 * `Link Uri`, both strings (a varuint32 byte length followed by UTF-8).
 */
export default class EduUriResourcePacket extends NetworkPacket<EduUriResource> {
    public get id(): number {
        return PacketIdentifier.EDU_URI_RESOURCE;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: EduUriResource): void {
        const { buttonName, linkUri } = data.eduSharedUriResource;
        new EduSharedUriResource(buttonName, linkUri).serialize(stream);
    }

    protected deserializePayload(stream: NetworkBinaryStream): EduUriResource {
        const { buttonName, linkUri } = EduSharedUriResource.deserialize(stream);
        return { eduSharedUriResource: { buttonName, linkUri } };
    }
}
