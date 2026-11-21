/**
 * Java Edition's compressed frames, which a connection uses after `Set Compression`.
 *
 * Each frame then starts with the uncompressed length as a VarInt: zero for a packet sent as is,
 * below the threshold, or the length of what zlib inflates to. The frame's own length, written by
 * the transport, comes before that.
 */
import { deflateSync, inflateSync } from 'node:zlib';

import BinaryStream from '@jsprismarine/binaryutils';
import { ProtocolWireErrors } from '@jsprismarine/errors/protocol/wire';

import { varInt } from './javaTypes';

/** The longest packet a client may say a compressed frame inflates to, as the vanilla server allows. */
const MAX_UNCOMPRESSED = 8_388_608;

/**
 * A packet as a compressed connection frames it.
 * @param packet - The packet id and fields.
 * @param threshold - The smallest packet compressed.
 * @returns The frame's bytes.
 */
export const compressFrame = (packet: Buffer, threshold: number): Buffer => {
    const stream = new BinaryStream();
    if (packet.byteLength < threshold) {
        varInt.write(stream, 0);
        stream.write(packet);
    } else {
        varInt.write(stream, packet.byteLength);
        stream.write(deflateSync(packet));
    }
    return stream.getBuffer();
};

/**
 * The packet inside a compressed connection's frame.
 * @param frame - The frame's bytes.
 * @param threshold - The smallest packet the client compresses.
 * @returns The packet id and fields.
 * @throws {Error} When the frame names a length the threshold or the limit rules out, or inflates to another length.
 */
export const decompressFrame = (frame: Buffer, threshold: number): Buffer => {
    const stream = new BinaryStream(frame);
    const length = varInt.read(stream);
    const body = stream.readRemaining();
    if (length === 0) return body;
    if (length < threshold || length > MAX_UNCOMPRESSED) {
        throw new ProtocolWireErrors.JavaFrameLengthOutOfRange({ length, threshold });
    }
    const packet = inflateSync(body, { maxOutputLength: length });
    if (packet.byteLength !== length) {
        throw new ProtocolWireErrors.JavaFrameLengthOutOfRange({ length, threshold });
    }
    return packet;
};
