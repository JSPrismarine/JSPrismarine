import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { eduUriResourcePacket } from '../wire/definitions/eduUriResource';
import { layoutAt } from '../wire/WireLayout';

import type NetworkBinaryStream from '../NetworkBinaryStream';
import type { EduUriResourcePayload } from '../wire/definitions/eduUriResource';

/** The fields of an `EduUriResourcePacket`, in wire order. */
export type EduUriResource = EduUriResourcePayload;

/**
 * The link an Education Edition server shares with every connected client.
 *
 * Docs packet 170, server to client. `StartGamePacket` carries the same resource inside
 * `LevelSettings` for a joining player; this packet updates it for players already in the
 * world.
 *
 * Protocol 2193 layout: one `EduSharedUriResource`, which is `Button Name` then
 * `Link Uri`, both strings (a varuint32 byte length followed by UTF-8).
 */
export default class EduUriResourcePacket extends NetworkPacket<EduUriResource> {
    public get id(): number {
        return PacketIdentifier.EDU_URI_RESOURCE;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: EduUriResource): void {
        layoutAt(eduUriResourcePacket, this.codecProtocol).encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): EduUriResource {
        return layoutAt(eduUriResourcePacket, this.codecProtocol).decode(stream);
    }
}
