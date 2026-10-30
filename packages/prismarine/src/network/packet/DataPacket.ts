import FieldNetworkPacket from '@jsprismarine/protocol/FieldNetworkPacket';

const PID_MASK = 0x3ff;

/**
 * The packet id at the front of an encoded packet, without decoding the rest of it.
 *
 * Needed because something has to choose which class to build before there is an instance to
 * ask. The header is an unsigned varint carrying the id in its low ten bits and the two
 * subclient ids above them - not a byte, though it looks like one for every id below 256:
 * there the varint's first byte happens to equal the id. Above that the coincidence ends, and
 * reading the first byte gave 179 for packet 307, which was dispatched to whichever class
 * owned 179 and then failed to decode as itself. `SetPlayerInventoryOptions` is 0x133, which
 * is how switching an inventory tab came to raise an error about ticking areas.
 * @param {Uint8Array} buffer - an encoded packet, positioned at its header.
 * @returns {number} the packet id.
 */
export const readPacketId = (buffer: Uint8Array): number => {
    let value = 0;

    for (let shift = 0; shift < 35; shift += 7) {
        const byte = buffer[shift / 7];
        if (byte === undefined) break; // Truncated; the caller will not find it in the registry.

        value |= (byte & 0x7f) << shift;
        if ((byte & 0x80) === 0) break;
    }

    return value & PID_MASK;
};

/**
 * The base class for all packets.
 * @class
 * @public
 */
export default class DataPacket extends FieldNetworkPacket {}
