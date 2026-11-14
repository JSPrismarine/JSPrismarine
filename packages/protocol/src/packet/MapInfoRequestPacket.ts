import { MAX_CLIENT_PIXELS, mapInfoRequestPacket } from '../wire/definitions/mapInfoRequest';
import { layoutAt } from '../wire/WireLayout';

import FieldNetworkPacket from '../FieldNetworkPacket';

import type { MapClientPixel } from '../wire/definitions/mapInfoRequest';

export { MAX_CLIENT_PIXELS };
export type { MapClientPixel };

/**
 * The client asking for a map's data, and offering pixels it rendered itself.
 *
 * Wire layout, identical at protocols 2193 and 2225: Map Unique ID as a ZigZag varint64, then Client Pixels List
 * as a uint32 LE count ("no size compression") of pixel (uint32 LE) and index (uint16 LE)
 * pairs. The layout lives in `wire/definitions/mapInfoRequest.ts`, which this class walks.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/map-info-request-packet/
 */
export default class MapInfoRequestPacket extends FieldNetworkPacket {
    /** The map's unique id, which is the id in the map item's NBT. */
    public mapUniqueId = 0n;

    /** Pixels the client rendered itself and wants the server's map to keep. */
    public clientPixels: MapClientPixel[] = [];

    /**
     * Reads the map id and the fixed-width-counted pixel list.
     *
     * The layout checks the count against {@link MAX_CLIENT_PIXELS} before reading any entry.
     */
    public decodePayload(): void {
        Object.assign(this, layoutAt(mapInfoRequestPacket, this.codecProtocol).decode(this));
    }

    /** Writes the map id and the pixel list. */
    public encodePayload(): void {
        layoutAt(mapInfoRequestPacket, this.codecProtocol).encode(this, this);
    }
}
