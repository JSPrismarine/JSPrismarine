/**
 * `MapInfoRequestPacket`: the client asking for a map's data, and offering pixels it rendered
 * itself.
 *
 * Field names and order follow the docs packet page. `Client Pixels List` carries its count as
 * a uint32 LE ("no size compression"), then pixel (uint32 LE) and index (uint16 LE) pairs.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/map-info-request-packet/}
 */
import { definePacket } from '../../../wire/define';
import * as t from '../../../wire/fieldTypes';

import type { PayloadOf } from '../../../wire/define';
import { ProtocolWireErrors } from '@jsprismarine/errors/protocol/wire';

/**
 * The most `Client Pixels List` entries this decoder accepts in one packet, one per pixel of a
 * 128 by 128 map. The docs page states no limit; this is a guard against a hostile count, and
 * it does not change the layout of any real packet.
 */
export const MAX_CLIENT_PIXELS = 16384;

/** One pixel the client sampled from its own chunks and wants the server's map to keep. */
export interface MapClientPixel {
    /** The color as the client packs it, a uint32. */
    pixel: number;
    /** Position in the 128 by 128 map, as row times 128 plus column. */
    index: number;
}

const clientPixel = t.record({
    /** The color as the client packs it, a uint32 LE. */
    pixel: t.lu32,
    /** Position in the 128 by 128 map, a uint16 LE. */
    index: t.lu16
});

const pixelsWithCount = t.listWith(t.lu32, clientPixel);

/**
 * `Client Pixels List`: a uint32 LE count, then the pixels.
 *
 * Decoding checks the count against {@link MAX_CLIENT_PIXELS} before reading any entry. A uint32
 * count can claim four billion entries, and a reader that trusts it loops until the buffer runs
 * dry. That bound is why this is not a plain `listWith(t.lu32, ...)`.
 */
const clientPixelsList = t.custom<MapClientPixel[]>(
    `list<${clientPixel.wire}, ${t.lu32.wire}, max ${MAX_CLIENT_PIXELS}>`,
    (s, v) => pixelsWithCount.write(s, v),
    (s) => {
        const count = t.lu32.read(s);
        if (count > MAX_CLIENT_PIXELS) {
            throw new ProtocolWireErrors.TooManyMapPixels({
                count,
                maxClientPixels: MAX_CLIENT_PIXELS
            });
        }

        const pixels: MapClientPixel[] = [];
        for (let i = 0; i < count; i++) pixels.push(clientPixel.read(s));
        return pixels;
    }
);

/** The `MapInfoRequestPacket` field list; the module doc carries the wire provenance. */
export const mapInfoRequestPacket = definePacket('MapInfoRequestPacket', {
    /** `Map Unique ID`: the id in the map item's NBT. */
    mapUniqueId: t.varint64,
    /** `Client Pixels List`: pixels the client rendered itself and wants the server's map to keep. */
    clientPixels: clientPixelsList
});

/** The map id and the pixels the client offers. */
export type MapInfoRequestPayload = PayloadOf<typeof mapInfoRequestPacket>;
