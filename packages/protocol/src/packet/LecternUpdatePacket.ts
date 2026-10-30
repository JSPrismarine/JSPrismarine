import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import BlockPos from '../structure/BlockPos';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/** A player turning to a page in a lectern book. */
export interface LecternUpdate {
    /** Zero-based page the client wants shown. */
    newPage: number;
    /** Number of pages in the book, as the client sees it. */
    totalPages: number;
    /** Position of the lectern, encoded as a signed `BlockPos`. */
    position: BlockPos;
}

/**
 * The client tells the server which page to display on a lectern.
 *
 * Protocol 2193 layout: `Page` (uint8), `Total Pages` (uint8), then `Position` as three
 * ZigZag varint32 coordinates. Dropping the book is no longer part of this packet.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/lectern-update-packet/
 */
export default class LecternUpdatePacket extends NetworkPacket<LecternUpdate> {
    public get id(): number {
        return PacketIdentifier.LECTERN_UPDATE;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: LecternUpdate): void {
        stream.writeByte(data.newPage);
        stream.writeByte(data.totalPages);
        data.position.serialize(stream);
    }

    protected deserializePayload(stream: NetworkBinaryStream): LecternUpdate {
        const newPage = stream.readByte();
        const totalPages = stream.readByte();
        const position = new BlockPos(0, 0, 0);
        position.deserialize(stream);
        return { newPage, totalPages, position };
    }
}
