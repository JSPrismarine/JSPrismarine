import Identifiers from '../Identifiers';
import { NetworkUtil } from '../NetworkUtil';
import BlockPosition from '../../world/BlockPosition';
import DataPacket from './DataPacket';

/**
 * The client turning the page of a book on a lectern.
 *
 * Wire layout at protocol 2193: New page to show as a uint8, Total Pages as a uint8, then
 * Position of Lectern to update as a `BlockPos` (three ZigZag varint32). Dropping the book is
 * no longer part of this packet.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/lectern-update-packet/
 */
export default class LecternUpdatePacket extends DataPacket {
    public static NetID = Identifiers.LecternUpdatePacket;

    /** Zero-based page the client wants shown. */
    public newPage = 0;

    /** Page count of the book as the client sees it. */
    public totalPages = 0;

    public position = new BlockPosition(0, 0, 0);

    /** Reads the page numbers and the lectern position. */
    public decodePayload(): void {
        this.newPage = this.readByte();
        this.totalPages = this.readByte();
        this.position = NetworkUtil.readBlockPosition(this);
    }

    /** Writes the page numbers and the lectern position. */
    public encodePayload(): void {
        this.writeByte(this.newPage);
        this.writeByte(this.totalPages);
        NetworkUtil.writeBlockPosition(this, this.position);
    }
}
