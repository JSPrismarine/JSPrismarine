import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

/** One pixel the client sampled from its own chunks and wants the server's map to keep. */
export interface MapClientPixel {
    /** The color as the client packs it, a uint32 (RGBA). */
    pixel: number;
    /** Position in the 128 by 128 map, as row times 128 plus column. */
    index: number;
}

/**
 * The client asking for a map's data, and offering pixels it rendered itself.
 *
 * Wire layout at protocol 2193: Map Unique ID as a ZigZag varint64, then Client Pixels List
 * as a uint32 LE count ("no size compression") of pixel (uint32 LE) and index (uint16 LE)
 * pairs.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.50/packets/map-info-request-packet/
 */
export default class MapInfoRequestPacket extends DataPacket {
    public static NetID = Identifiers.MapInfoRequestPacket;

    /** The map's unique id, which is the id in the map item's NBT. */
    public mapUniqueId = 0n;

    public clientPixels: MapClientPixel[] = [];

    /** Reads the map id and the fixed-width-counted pixel list. */
    public decodePayload(): void {
        this.mapUniqueId = this.readVarLong();

        const count = this.readUnsignedIntLE();
        this.clientPixels = [];
        for (let index = 0; index < count; index++) {
            this.clientPixels.push({ pixel: this.readUnsignedIntLE(), index: this.readUnsignedShortLE() });
        }
    }

    /** Writes the map id and the pixel list. */
    public encodePayload(): void {
        this.writeVarLong(this.mapUniqueId);
        this.writeUnsignedIntLE(this.clientPixels.length);
        for (const entry of this.clientPixels) {
            this.writeUnsignedIntLE(entry.pixel);
            this.writeUnsignedShortLE(entry.index);
        }
    }
}
